import { NextResponse } from "next/server";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { getDb } from "@/lib/db";

/**
 * GET /api/governance/summary
 * Returns governance posture stats. Global admin only.
 */
export async function GET() {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();
    if (!auth.isGlobalAdmin) return forbidden();

    const db = getDb();

    // Agent stats
    const totalAgents = (db.prepare("SELECT COUNT(*) AS n FROM agents").get() as { n: number }).n;

    const agentDidsWithPolicies = db.prepare(`
      SELECT DISTINCT agent_did FROM policies
      WHERE agent_did IS NOT NULL AND (expires_at IS NULL OR expires_at > datetime('now'))
    `).all() as { agent_did: string }[];
    const coveredDids = new Set(agentDidsWithPolicies.map((r) => r.agent_did));
    const uncoveredAgents = totalAgents - coveredDids.size;

    // High-risk agents: those with system_command, code_execution, or browser_control
    const allAgents = db.prepare("SELECT did, capabilities FROM agents").all() as { did: string; capabilities: string }[];
    const HIGH_RISK_CAPS = ["system_command", "code_execution", "browser_control"];
    const highRiskAgents = allAgents
      .map((a) => ({ did: a.did, caps: JSON.parse(a.capabilities) as string[] }))
      .filter((a) => a.caps.some((c) => HIGH_RISK_CAPS.includes(c)));

    // Intent log stats (last 30 days)
    const intentStats = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success
      FROM intent_log
      WHERE sent_at > datetime('now', '-30 days')
    `).get() as { total: number; failed: number; pending: number; success: number };

    // Approval stats
    const approvalStats = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending
      FROM workflow_approvals
    `).get() as { total: number; approved: number; rejected: number; pending: number };

    // Policy stats
    const policyStats = db.prepare(`
      SELECT
        SUM(CASE WHEN expires_at IS NULL OR expires_at > datetime('now') THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN expires_at IS NOT NULL AND expires_at <= datetime('now') THEN 1 ELSE 0 END) AS expired
      FROM policies
    `).get() as { active: number; expired: number };

    // Budget violations: agents where today's token usage exceeds daily budget
    const budgetViolations = db.prepare(`
      SELECT COUNT(*) AS n FROM agents a
      JOIN agent_token_usage_history h ON h.agent_did = a.did
      WHERE a.token_budget_daily IS NOT NULL
        AND h.granularity = 'day'
        AND h.bucket = strftime('%Y-%m-%d', 'now')
        AND (h.prompt_tokens + h.completion_tokens) > a.token_budget_daily
    `).get() as { n: number };

    const monthlyBudgetViolations = db.prepare(`
      SELECT COUNT(*) AS n FROM agents a
      JOIN agent_token_usage_history h ON h.agent_did = a.did
      WHERE a.token_budget_monthly IS NOT NULL
        AND h.granularity = 'month'
        AND h.bucket = strftime('%Y-%m', 'now')
        AND (h.prompt_tokens + h.completion_tokens) > a.token_budget_monthly
    `).get() as { n: number };

    const successRate = intentStats.total > 0
      ? Math.round((intentStats.success / intentStats.total) * 100)
      : 100;

    const approvalDecided = (approvalStats.approved ?? 0) + (approvalStats.rejected ?? 0);
    const approvalRate = approvalDecided > 0
      ? Math.round(((approvalStats.approved ?? 0) / approvalDecided) * 100)
      : null;

    return NextResponse.json({
      agents: {
        total: totalAgents,
        uncovered: uncoveredAgents,
        highRisk: highRiskAgents.length,
        highRiskList: highRiskAgents.map((a) => ({
          did: a.did,
          riskyCaps: a.caps.filter((c) => HIGH_RISK_CAPS.includes(c)),
        })),
      },
      intents: {
        total: intentStats.total ?? 0,
        failed: intentStats.failed ?? 0,
        pending: intentStats.pending ?? 0,
        successRate,
      },
      approvals: {
        total: approvalStats.total ?? 0,
        approved: approvalStats.approved ?? 0,
        rejected: approvalStats.rejected ?? 0,
        pending: approvalStats.pending ?? 0,
        approvalRate,
      },
      policies: {
        active: policyStats.active ?? 0,
        expired: policyStats.expired ?? 0,
      },
      budgets: {
        agentsOverDailyBudget: budgetViolations.n ?? 0,
        agentsOverMonthlyBudget: monthlyBudgetViolations.n ?? 0,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch governance summary" }, { status: 500 });
  }
}
