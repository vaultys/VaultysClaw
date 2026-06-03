import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { getDb } from "@/lib/db";

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

    const db = getDb();
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
      const activityQuery = agentDidFilter
        ? "SELECT * FROM activity_log WHERE agent_did = ? ORDER BY created_at DESC LIMIT ?"
        : "SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?";
      const activityParams = agentDidFilter ? [agentDidFilter, limit] : [limit];
      const rows = db.prepare(activityQuery).all(...activityParams) as {
        id: number;
        event: string;
        agent_did: string | null;
        agent_name: string | null;
        details: string | null;
        created_at: string;
      }[];

      for (const r of rows) {
        entries.push({
          id: `act-${r.id}`,
          source: "activity",
          event: r.event,
          agentDid: r.agent_did,
          agentName: r.agent_name,
          details: r.details,
          status: null,
          error: null,
          timestamp: r.created_at,
        });
      }
    }

    // Intent log entries
    if (!source || source === "intent") {
      let query = "SELECT * FROM intent_log";
      const params: unknown[] = [];
      const conditions: string[] = [];
      if (statusFilter)
        conditions.push("status = ?") && params.push(statusFilter);
      if (agentDidFilter)
        conditions.push("agent_did = ?") && params.push(agentDidFilter);
      if (conditions.length) query += " WHERE " + conditions.join(" AND ");
      query += " ORDER BY sent_at DESC LIMIT ?";
      params.push(limit);

      const rows = db.prepare(query).all(...params) as {
        intent_id: string;
        agent_did: string | null;
        action: string;
        status: string;
        error: string | null;
        params: string | null;
        sent_at: string;
        completed_at: string | null;
      }[];

      for (const r of rows) {
        entries.push({
          id: `int-${r.intent_id}`,
          source: "intent",
          event: r.action,
          agentDid: r.agent_did,
          agentName: null,
          details: r.params,
          status: r.status,
          error: r.error,
          timestamp: r.sent_at,
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
