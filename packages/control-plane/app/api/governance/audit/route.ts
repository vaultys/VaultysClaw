import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { prisma } from "@/db/client";

/**
 * GET /api/governance/audit
 * Returns a unified audit stream: activity_log + intent_log merged by timestamp.
 * Global admin only.
 *
 * Query params:
 *   limit    – max entries (default 200, max 500)
 *   source   – "activity" | "intent" | "" (both)
 *   status   – filter intent_log by status ("success"|"failed"|"pending")
 *   agentDid – filter both tables to a specific agent DID
 */
/**
 * @openapi
 * /api/governance/audit:
 *   get:
 *     summary: Retrieve a unified audit stream of activity and intent logs.
 *     tags: [Governance]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 200
 *           maximum: 500
 *         description: Maximum number of entries to return.
 *       - in: query
 *         name: source
 *         schema:
 *           type: string
 *           enum: [activity, intent, ""]
 *         description: Filter by log source.
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [success, failed, pending]
 *         description: Filter intent logs by status.
 *       - in: query
 *         name: agentDid
 *         schema:
 *           type: string
 *         description: Filter logs by a specific agent DID.
 *     responses:
 *       200:
 *         description: A list of audit log entries.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 entries:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       source:
 *                         type: string
 *                       event:
 *                         type: string
 *                       agentDid:
 *                         type: string
 *                         nullable: true
 *                       agentName:
 *                         type: string
 *                         nullable: true
 *                       details:
 *                         type: string
 *                         nullable: true
 *                       status:
 *                         type: string
 *                         nullable: true
 *                       error:
 *                         type: string
 *                         nullable: true
 *                       timestamp:
 *                         type: string
 *                 total:
 *                   type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         description: Failed to fetch audit log.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) return unauthorized();
    if (!auth.isGlobalAdmin) return forbidden();

    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      500,
      Math.max(1, parseInt(searchParams.get("limit") ?? "200", 10) || 200)
    );
    const source = searchParams.get("source") ?? "";
    const statusFilter = searchParams.get("status") ?? "";
    const agentDidFilter = searchParams.get("agentDid") ?? "";

    type AuditEntry = {
      id: string;
      source: "activity" | "intent";
      event: string;
      agentDid: string | null;
      agentName: string | null;
      details: string | null;
      status: string | null;
      error: string | null;
      timestamp: string;
    };

    const entries: AuditEntry[] = [];

    // Activity log entries
    if (!source || source === "activity") {
      const activityRows = await prisma.activityLog.findMany({
        where: agentDidFilter ? { agentDid: agentDidFilter } : undefined,
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      for (const r of activityRows) {
        entries.push({
          id: `act-${r.id}`,
          source: "activity",
          event: r.event,
          agentDid: r.agentDid,
          agentName: r.agentName,
          details: r.details,
          status: null,
          error: null,
          timestamp: r.createdAt.toISOString(),
        });
      }
    }

    // Intent log entries
    if (!source || source === "intent") {
      const intentWhere: Record<string, unknown> = {};
      if (statusFilter) intentWhere.status = statusFilter;
      if (agentDidFilter) intentWhere.agentDid = agentDidFilter;

      const intentRows = await prisma.intentLog.findMany({
        where: Object.keys(intentWhere).length ? intentWhere : undefined,
        orderBy: { sentAt: "desc" },
        take: limit,
      });

      for (const r of intentRows) {
        entries.push({
          id: `int-${r.intentId}`,
          source: "intent",
          event: r.action,
          agentDid: r.agentDid,
          agentName: null,
          details: r.params !== null ? JSON.stringify(r.params) : null,
          status: r.status,
          error: r.error,
          timestamp: r.sentAt.toISOString(),
        });
      }
    }

    // Sort merged result by timestamp desc, cap at limit
    entries.sort((a, b) => (a.timestamp > b.timestamp ? -1 : 1));
    const result = entries.slice(0, limit);

    return NextResponse.json({ entries: result, total: result.length });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to fetch audit log" },
      { status: 500 }
    );
  }
}
