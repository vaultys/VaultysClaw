import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { getDb } from "@/lib/db";
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
  try {
    const auth = await getAuthContext(_req);
    if (!auth) return unauthorized();
    if (!auth.isGlobalAdmin) return forbidden();

    const { id } = await ctx.params;
    const db = getDb();

    // ── Activity entry ──────────────────────────────────────────────────────
    if (id.startsWith("act-")) {
      const rowId = parseInt(id.slice(4), 10);
      if (isNaN(rowId))
        return NextResponse.json({ error: "Invalid id" }, { status: 400 });

      const row = db
        .prepare("SELECT * FROM activity_log WHERE id = ?")
        .get(rowId) as
        | {
            id: number;
            event: string;
            agent_did: string | null;
            agent_name: string | null;
            details: string | null;
            created_at: string;
          }
        | undefined;

      if (!row)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      // Parse details JSON if possible
      let detailsParsed: unknown = null;
      try {
        if (row.details) detailsParsed = JSON.parse(row.details);
      } catch {
        /* keep raw */
      }

      // Resolve agent cert info if we have a DID
      const certInfo = row.agent_did
        ? resolveCertInfo(db, row.agent_did)
        : null;

      return NextResponse.json({
        entry: {
          id,
          source: "activity",
          event: row.event,
          agentDid: row.agent_did,
          agentName: row.agent_name,
          details: row.details,
          detailsParsed,
          status: null,
          error: null,
          timestamp: row.created_at,
          // activity-specific
          params: null,
          output: null,
          sentAt: row.created_at,
          completedAt: null,
          durationMs: null,
        },
        certInfo,
      });
    }

    // ── Intent entry ────────────────────────────────────────────────────────
    if (id.startsWith("int-")) {
      const intentId = id.slice(4);

      const row = db
        .prepare("SELECT * FROM intent_log WHERE intent_id = ?")
        .get(intentId) as
        | {
            intent_id: string;
            agent_did: string | null;
            action: string;
            params: string | null;
            status: string;
            output: string | null;
            error: string | null;
            sent_at: string;
            completed_at: string | null;
          }
        | undefined;

      if (!row)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      // Parse params / output
      let paramsParsed: unknown = null;
      let outputParsed: unknown = null;
      try {
        if (row.params) paramsParsed = row.params;
      } catch {
        /* raw */
      }
      try {
        if (row.output) outputParsed = row.output;
      } catch {
        /* raw */
      }

      const durationMs =
        row.completed_at && row.sent_at
          ? new Date(row.completed_at).getTime() -
            new Date(row.sent_at).getTime()
          : null;

      // Look up agent name from agents table
      const agentRow = row.agent_did
        ? (db
            .prepare("SELECT name FROM agents WHERE did = ?")
            .get(row.agent_did) as { name: string } | undefined)
        : undefined;

      const certInfo = row.agent_did
        ? resolveCertInfo(db, row.agent_did)
        : null;

      return NextResponse.json({
        entry: {
          id,
          source: "intent",
          event: row.action,
          agentDid: row.agent_did,
          agentName: agentRow?.name ?? null,
          details: row.params,
          detailsParsed: paramsParsed,
          status: row.status,
          error: row.error,
          timestamp: row.sent_at,
          // intent-specific
          params: paramsParsed,
          output: outputParsed,
          sentAt: row.sent_at,
          completedAt: row.completed_at,
          durationMs,
        },
        certInfo,
      });
    }

    return NextResponse.json({ error: "Invalid id format" }, { status: 400 });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to fetch audit entry" },
      { status: 500 }
    );
  }
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
function resolveCertInfo(
  db: ReturnType<typeof getDb>,
  agentDid: string
): Record<string, unknown> | null {
  try {
    const agentRow = db
      .prepare("SELECT certificate_data FROM agents WHERE did = ?")
      .get(agentDid) as { certificate_data: string | null } | undefined;

    if (!agentRow?.certificate_data) return null;

    const certBuf = Buffer.from(agentRow.certificate_data, "base64");
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
      signedPayload: agentRow.certificate_data,
      // governance metadata
      capabilities,
      resourceLimits: pk2Meta?.resourceLimits ?? null,
      policyId: pk2Meta?.policyId ?? null,
      policyExpiresAt: pk2Meta?.policyExpiresAt ?? null,
      // full raw metadata for transparency
      rawMetadata: (cert as any).metadata ?? null,
    };
  } catch {
    return null;
  }
}
