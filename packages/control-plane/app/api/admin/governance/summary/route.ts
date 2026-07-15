import { prisma } from "@/db/client";
import { AgentDAO, PolicyDAO } from "@/db";
import {
  adminContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

/**
 * Routes for /api/admin/governance/summary — the summary slice of `adminContract.governance`.
 *
 * Returns governance posture statistics. Global admin only. The contract is the
 * single source of truth for the response shape.
 */
const handlers = createNextRoute(adminContract.governance, {
  summary: async () => {

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Agent stats
    const [totalAgents, allAgents] = await Promise.all([
      prisma.agent.count(),
      AgentDAO.findAll(),
    ]);

    // Agents covered by an active policy
    const activePolicies = await PolicyDAO.list({ includeExpired: false });
    const coveredDids = new Set(
      activePolicies
        .filter((p) => p.agentDid !== null)
        .map((p) => p.agentDid as string)
    );
    const uncoveredAgents = totalAgents - coveredDids.size;

    // High-risk agents: those with system_command, code_execution, or browser_control
    const HIGH_RISK_CAPS = [
      "system_command",
      "code_execution",
      "browser_control",
    ];
    const highRiskAgents = allAgents
      .map((a) => ({
        did: a.did,
        caps: (Array.isArray(a.capabilities)
          ? a.capabilities
          : JSON.parse(a.capabilities as string)) as string[],
      }))
      .filter((a) => a.caps.some((c) => HIGH_RISK_CAPS.includes(c)));

    // Intent log stats (last 30 days)
    const [intentTotal, intentFailed, intentPending, intentSuccess] =
      await Promise.all([
        prisma.intentLog.count({ where: { sentAt: { gt: thirtyDaysAgo } } }),
        prisma.intentLog.count({
          where: { sentAt: { gt: thirtyDaysAgo }, status: "failed" },
        }),
        prisma.intentLog.count({
          where: { sentAt: { gt: thirtyDaysAgo }, status: "pending" },
        }),
        prisma.intentLog.count({
          where: { sentAt: { gt: thirtyDaysAgo }, status: "success" },
        }),
      ]);

    // Approval stats
    const [approvalTotal, approvalApproved, approvalRejected, approvalPending] =
      await Promise.all([
        prisma.workflowApproval.count(),
        prisma.workflowApproval.count({ where: { status: "approved" } }),
        prisma.workflowApproval.count({ where: { status: "rejected" } }),
        prisma.workflowApproval.count({ where: { status: "pending" } }),
      ]);

    // Policy stats: active vs expired
    const [activeCount, expiredCount] = await Promise.all([
      prisma.policy.count({
        where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      }),
      prisma.policy.count({
        where: { expiresAt: { not: null, lte: now } },
      }),
    ]);

    // Budget violations: agents where today's token usage exceeds daily budget
    const today = now.toISOString().slice(0, 10);
    const thisMonth = now.toISOString().slice(0, 7);

    const [dailyViolations, monthlyViolations] = await Promise.all([
      prisma.agentTokenUsageHistory.findMany({
        where: { granularity: "day", bucket: today },
        include: {
          agent: { select: { tokenBudgetDaily: true } },
        },
      }),
      prisma.agentTokenUsageHistory.findMany({
        where: { granularity: "month", bucket: thisMonth },
        include: {
          agent: { select: { tokenBudgetMonthly: true } },
        },
      }),
    ]);

    const agentsOverDailyBudget = dailyViolations.filter(
      (h) =>
        h.agent.tokenBudgetDaily !== null &&
        h.promptTokens + h.completionTokens > h.agent.tokenBudgetDaily
    ).length;

    const agentsOverMonthlyBudget = monthlyViolations.filter(
      (h) =>
        h.agent.tokenBudgetMonthly !== null &&
        h.promptTokens + h.completionTokens > h.agent.tokenBudgetMonthly
    ).length;

    const successRate =
      intentTotal > 0 ? Math.round((intentSuccess / intentTotal) * 100) : 100;

    const approvalDecided = approvalApproved + approvalRejected;
    const approvalRate =
      approvalDecided > 0
        ? Math.round((approvalApproved / approvalDecided) * 100)
        : null;

    return {
      status: 200 as const,
      body: {
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
          total: intentTotal,
          failed: intentFailed,
          pending: intentPending,
          successRate,
        },
        approvals: {
          total: approvalTotal,
          approved: approvalApproved,
          rejected: approvalRejected,
          pending: approvalPending,
          approvalRate,
        },
        policies: {
          active: activeCount,
          expired: expiredCount,
        },
        budgets: {
          agentsOverDailyBudget,
          agentsOverMonthlyBudget,
        },
      },
    };
  },
});

export const GET = handlers.GET!;
