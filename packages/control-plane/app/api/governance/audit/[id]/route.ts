import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden, notFound, malformed } from "@/lib/api-utils";
import { prisma } from "@/db/client";
import { AgentDAO } from "@/db";
import { Challenger, VaultysId, crypto } from "@vaultys/id";

const Buffer = crypto.Buffer;

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/governance/audit/[id]
 * Returns a single audit entry (activity or intent) with full payload,
 * parsed details, and certificate metadata for auth-related events.
 *
 * ID format:  act-{rowid}   → activity_log
 *             int-{intentId} → intent_log
 */
/**
 * @openapi
 * /api/governance/audit/{id}:
 *   get:
 *     summary: Retrieve a single audit entry with full details and metadata.
 *     tags: [Governance]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the audit entry (e.g., act-{rowid} or int-{intentId}).
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Audit entry retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 entry:
 *                   type: object
 *                   description: The audit entry details.
 *                 certInfo:
 *                   type: object
 *                   description: Certificate information for the agent.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to fetch audit entry.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(_req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { id } = await ctx.params;

  // ── Activity entry ──────────────────────────────────────────────────────
  if (id.startsWith("act-")) {
    const rowId = parseInt(id.slice(4), 10);
    if (isNaN(rowId)) return malformed("Invalid activity log ID");

    const row = await prisma.activityLog.findUnique({ where: { id: rowId } });

    if (!row) return notFound("Activity log not found");

    // Parse details JSON if possible
    let detailsParsed: unknown = null;
    try {
      if (row.details) detailsParsed = JSON.parse(row.details);
    } catch {
      /* keep raw */
    }

    // Resolve agent cert info if we have a DID
    const certInfo = row.agentDid ? await resolveCertInfo(row.agentDid) : null;

    return NextResponse.json({
      entry: {
        id,
        source: "activity",
        event: row.event,
        agentDid: row.agentDid,
        agentName: row.agentName,
        details: row.details,
        detailsParsed,
        status: null,
        error: null,
        timestamp: row.createdAt.toISOString(),
        // activity-specific
        params: null,
        output: null,
        sentAt: row.createdAt.toISOString(),
        completedAt: null,
        durationMs: null,
      },
      certInfo,
    });
  }

  // ── Intent entry ────────────────────────────────────────────────────────
  if (id.startsWith("int-")) {
    const intentId = id.slice(4);

    const row = await prisma.intentLog.findUnique({
      where: { intentId },
    });

    if (!row) return notFound("Intent log not found");

    // params and output are already parsed JSON from Prisma (Json type)
    const paramsParsed: unknown = row.params ?? null;
    const outputParsed: unknown = row.output ?? null;

    const durationMs =
      row.completedAt && row.sentAt
        ? row.completedAt.getTime() - row.sentAt.getTime()
        : null;

    // Look up agent name from agents table
    const agentRecord = row.agentDid
      ? await AgentDAO.findByDid(row.agentDid)
      : null;

    const certInfo = row.agentDid ? await resolveCertInfo(row.agentDid) : null;

    return NextResponse.json({
      entry: {
        id,
        source: "intent",
        event: row.action,
        agentDid: row.agentDid,
        agentName: agentRecord?.name ?? null,
        details: row.params !== null ? JSON.stringify(row.params) : null,
        detailsParsed: paramsParsed,
        status: row.status,
        error: row.error,
        timestamp: row.sentAt.toISOString(),
        // intent-specific
        params: paramsParsed,
        output: outputParsed,
        sentAt: row.sentAt.toISOString(),
        completedAt: row.completedAt?.toISOString() ?? null,
        durationMs,
      },
      certInfo,
    });
  }

  return malformed("Invalid id format");
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Deserialize the agent's most recent certificate and extract:
 *  - capabilities, resourceLimits, policyId, policyExpiresAt from cert metadata
 *  - protocol, state, timestamp
 *  - pk1 / pk2 DIDs (control-plane and agent)
 *  - signedPayload: full base64 of the serialized certificate
 *  - signatureVerified: true when the mutual challenge-response completed (state === 2)
 *
 * Returns null if the agent has no certificate or deserialization fails.
 */
async function resolveCertInfo(
  agentDid: string
): Promise<Record<string, unknown> | null> {
  const agentRow = await prisma.agent.findUnique({
    where: { did: agentDid },
    select: { certificateData: true },
  });

  if (!agentRow?.certificateData) return null;

  const certBuf = Buffer.from(agentRow.certificateData, "base64");
  const cert = Challenger.deserializeCertificate(certBuf);
  if (!cert) return null;

  // Extract governance metadata embedded in pk2 (server-assigned)
  const pk2Meta = (cert as any).metadata?.pk2 ?? null;

  // Read capabilities — handle both native array and legacy JSON string
  let capabilities: string[] | null = null;
  if (pk2Meta?.capabilities) {
    if (Array.isArray(pk2Meta.capabilities))
      capabilities = pk2Meta.capabilities;
    else if (typeof pk2Meta.capabilities === "string") {
      try {
        capabilities = pk2Meta.capabilities;
      } catch {
        /* skip */
      }
    }
  }

  // Derive DIDs from public key bytes
  let pk1Did: string | null = null;
  let pk2Did: string | null = null;
  try {
    if ((cert as any).pk1)
      pk1Did = VaultysId.fromId(
        Buffer.from((cert as any).pk1 as Uint8Array)
      ).did;
  } catch {
    /* ignore */
  }
  try {
    if ((cert as any).pk2)
      pk2Did = VaultysId.fromId(
        Buffer.from((cert as any).pk2 as Uint8Array)
      ).did;
  } catch {
    /* ignore */
  }

  const state: number | null = (cert as any).state ?? null;

  return {
    protocol: (cert as any).protocol ?? null,
    state,
    certTimestamp: (cert as any).timestamp ?? null,
    error: (cert as any).error ?? null,
    // DIDs derived from the certificate public keys
    pk1Did,
    pk2Did,
    // signature verified = mutual challenge-response completed successfully
    signatureVerified: state === 2,
    // full serialized signed certificate (the signed payload)
    signedPayload: agentRow.certificateData,
    // governance metadata
    capabilities,
    resourceLimits: pk2Meta?.resourceLimits ?? null,
    policyId: pk2Meta?.policyId ?? null,
    policyExpiresAt: pk2Meta?.policyExpiresAt ?? null,
    // full raw metadata for transparency
    rawMetadata: (cert as any).metadata ?? null,
  };
}
