import {
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  AlertTriangle,
  CheckCircle2,
  Bot,
  FileText,
  Activity,
  Gauge,
} from "lucide-react";
import { shortDid } from "@vaultysclaw/shared";
import type { GovernanceSummary } from "@/lib/contracts";
import { StatCard } from "./StatCard";
import { CapPill } from "./CapPill";

export function OverviewTab({
  summary,
  loading,
}: {
  summary: GovernanceSummary | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-7 h-7 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!summary) return null;

  const { agents, intents, approvals, policies, budgets } = summary;
  const posture =
    agents.uncovered === 0 &&
    agents.highRisk === 0 &&
    budgets.agentsOverDailyBudget === 0 &&
    intents.successRate >= 90
      ? "ok"
      : agents.highRisk > 0 ||
          budgets.agentsOverDailyBudget > 0 ||
          intents.successRate < 70
        ? "danger"
        : "warn";

  const postureLabel =
    posture === "ok"
      ? "Good"
      : posture === "warn"
        ? "Needs attention"
        : "Action required";
  const PostureIcon =
    posture === "ok" ? ShieldCheck : posture === "warn" ? ShieldAlert : ShieldOff;

  return (
    <div className="space-y-6">
      {/* Posture banner */}
      <div
        className={`flex items-center gap-3 rounded-xl border p-4
 ${
   posture === "ok"
     ? "bg-success-50 border-success-500/30 text-success-700"
     : posture === "warn"
       ? "bg-warning-50 border-warning-200 text-warning-700"
       : "bg-danger-50 border-danger-200 text-danger-600"
 }`}
      >
        <PostureIcon className="w-5 h-5 shrink-0" />
        <div>
          <p className="font-semibold text-sm">
            Overall posture: {postureLabel}
          </p>
          <p className="text-xs opacity-80 mt-0.5">
            {agents.uncovered} uncovered agent
            {agents.uncovered !== 1 ? "s" : ""} · {agents.highRisk} high-risk ·{" "}
            {policies.active} active polic{policies.active !== 1 ? "ies" : "y"}{" "}
            · {intents.successRate}% intent success rate
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          icon={<Bot className="w-4 h-4" />}
          label="Locked agents"
          value={agents.uncovered}
          sub={`of ${agents.total} total`}
          tone={agents.uncovered === 0 ? "ok" : "warn"}
        />
        <StatCard
          icon={<ShieldAlert className="w-4 h-4" />}
          label="High-risk agents"
          value={agents.highRisk}
          sub="system_cmd / code / browser"
          tone={agents.highRisk === 0 ? "ok" : "danger"}
        />
        <StatCard
          icon={<FileText className="w-4 h-4" />}
          label="Active policies"
          value={policies.active}
          sub={
            policies.expired > 0 ? `${policies.expired} expired` : "none expired"
          }
          tone="neutral"
        />
        <StatCard
          icon={<Activity className="w-4 h-4" />}
          label="Intent success (30d)"
          value={`${intents.successRate}%`}
          sub={`${intents.failed} failed, ${intents.pending} pending`}
          tone={
            intents.successRate >= 90
              ? "ok"
              : intents.successRate >= 70
                ? "warn"
                : "danger"
          }
        />
        <StatCard
          icon={<CheckCircle2 className="w-4 h-4" />}
          label="Approval rate"
          value={
            approvals.approvalRate !== null ? `${approvals.approvalRate}%` : "—"
          }
          sub={`${approvals.pending} pending approval${approvals.pending !== 1 ? "s" : ""}`}
          tone={
            approvals.approvalRate === null
              ? "neutral"
              : approvals.approvalRate >= 80
                ? "ok"
                : "warn"
          }
        />
      </div>

      {/* Budget alerts */}
      {(budgets.agentsOverDailyBudget > 0 ||
        budgets.agentsOverMonthlyBudget > 0) && (
        <div className="bg-danger-50 border border-danger-200 rounded-xl p-4 space-y-1">
          <p className="text-danger-600 font-semibold text-sm flex items-center gap-2">
            <Gauge className="w-4 h-4" /> Budget violations
          </p>
          {budgets.agentsOverDailyBudget > 0 && (
            <p className="text-xs text-danger-700">
              {budgets.agentsOverDailyBudget} agent
              {budgets.agentsOverDailyBudget !== 1 ? "s" : ""} exceeded daily
              token budget
            </p>
          )}
          {budgets.agentsOverMonthlyBudget > 0 && (
            <p className="text-xs text-danger-700">
              {budgets.agentsOverMonthlyBudget} agent
              {budgets.agentsOverMonthlyBudget !== 1 ? "s" : ""} exceeded monthly
              token budget
            </p>
          )}
        </div>
      )}

      {/* High-risk agents */}
      {agents.highRiskList.length > 0 && (
        <div className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning-700" /> High-risk
              agents
            </h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-xs text-foreground-400 uppercase tracking-wider">
                <th className="px-4 py-2 text-left">DID</th>
                <th className="px-4 py-2 text-left">Risky capabilities</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {agents.highRiskList.map((a) => (
                <tr
                  key={a.did}
                  className="hover:bg-background-200/40 transition-colors"
                >
                  <td
                    className="px-4 py-2.5 font-mono text-xs text-foreground-500"
                    title={a.did}
                  >
                    {shortDid(a.did)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {a.riskyCaps.map((c) => (
                        <CapPill key={c} cap={c} risky />
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
