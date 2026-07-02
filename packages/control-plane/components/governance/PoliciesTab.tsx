import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, RotateCcw, ShieldOff, Gauge } from "lucide-react";
import {
  shortDid,
  formatCompactNumber,
  formatDateTime,
  timeAgo,
} from "@vaultysclaw/shared";
import {
  adminAgentsClient,
  policiesClient,
  unwrap,
} from "@/lib/api/ts-rest/client";
import type { AgentInfo, PolicyEntry } from "@/lib/contracts";
import { CapPill } from "./CapPill";
import { BudgetBar } from "./BudgetBar";
import { RenewPolicyModal } from "./RenewPolicyModal";
import { ALL_CAPABILITIES, HIGH_RISK_CAPS } from "./constants";

export function PoliciesTab() {
  const [policies, setPolicies] = useState<PolicyEntry[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [renewPolicy, setRenewPolicy] = useState<PolicyEntry | null>(null);
  const [savingBudget, setSavingBudget] = useState<string | null>(null);

  // New policy form state
  const [form, setForm] = useState<{
    agentDid: string;
    capabilities: string[];
    maxTokensPerDay: string;
    maxRequestsPerHour: string;
    expiresAt: string;
  }>({
    agentDid: "",
    capabilities: [],
    maxTokensPerDay: "",
    maxRequestsPerHour: "",
    expiresAt: "",
  });

  // Budget edit state: did -> { daily, monthly }
  const [budgetEdits, setBudgetEdits] = useState<
    Record<string, { daily: string; monthly: string }>
  >({});

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [polRes, agentRes] = await Promise.all([
        policiesClient.list({ query: { includeExpired: false } }),
        adminAgentsClient.search({
          query: {
            pageSize: 100,
          },
        }),
      ]);
      setPolicies(unwrap(polRes).policies);
      setAgents(unwrap(agentRes).items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleCreate = async () => {
    if (!form.agentDid || form.capabilities.length === 0) return;
    setCreating(true);
    try {
      const resourceLimits: Record<string, unknown> = {};
      if (form.maxTokensPerDay)
        resourceLimits.maxTokensPerDay = parseInt(form.maxTokensPerDay);
      if (form.maxRequestsPerHour)
        resourceLimits.maxRequestsPerHour = parseInt(form.maxRequestsPerHour);

      unwrap(
        await policiesClient.create({
          body: {
            agentDid: form.agentDid,
            capabilities: form.capabilities,
            resourceLimits:
              Object.keys(resourceLimits).length > 0
                ? resourceLimits
                : undefined,
            expiresAt: form.expiresAt
              ? new Date(form.expiresAt).toISOString()
              : undefined,
          },
        })
      );
      setForm({
        agentDid: "",
        capabilities: [],
        maxTokensPerDay: "",
        maxRequestsPerHour: "",
        expiresAt: "",
      });
      await fetchAll();
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    setRevoking(id);
    try {
      await policiesClient.remove({ params: { id } });
      await fetchAll();
    } finally {
      setRevoking(null);
    }
  };

  const handleSaveBudget = async (did: string) => {
    const edit = budgetEdits[did];
    if (!edit) return;
    setSavingBudget(did);
    try {
      const daily = edit.daily === "" ? null : parseInt(edit.daily);
      const monthly = edit.monthly === "" ? null : parseInt(edit.monthly);
      await adminAgentsClient.updateAgent({
        params: { did },
        body: {
          tokenBudgetDaily: daily !== null && isNaN(daily) ? null : daily,
          tokenBudgetMonthly:
            monthly !== null && isNaN(monthly) ? null : monthly,
        },
      });
      setBudgetEdits((prev) => {
        const n = { ...prev };
        delete n[did];
        return n;
      });
      await fetchAll();
    } finally {
      setSavingBudget(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-7 h-7 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const coveredDids = new Set(policies.map((p) => p.agentDid).filter(Boolean));

  return (
    <div className="space-y-8">
      {/* Create policy form */}
      <div className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-200">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary-700" /> New policy
          </h3>
        </div>
        <div className="p-4 space-y-4">
          {/* Agent selector */}
          <div className="space-y-1">
            <label className="text-xs text-foreground-500">Target agent</label>
            <select
              value={form.agentDid}
              onChange={(e) =>
                setForm((f) => ({ ...f, agentDid: e.target.value }))
              }
              className="w-full px-3 py-2 bg-background-200 border border-neutral-200 rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Select agent…</option>
              {agents.map((a) => (
                <option key={a.did} value={a.did}>
                  {a.name} ({shortDid(a.did)})
                </option>
              ))}
            </select>
          </div>

          {/* Capabilities */}
          <div className="space-y-1">
            <label className="text-xs text-foreground-500">
              Allowed capabilities
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_CAPABILITIES.map((cap) => (
                <label
                  key={cap}
                  className="flex items-center gap-1.5 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={form.capabilities.includes(cap)}
                    onChange={(e) => {
                      setForm((f) => ({
                        ...f,
                        capabilities: e.target.checked
                          ? [...f.capabilities, cap]
                          : f.capabilities.filter((c) => c !== cap),
                      }));
                    }}
                    className="w-3.5 h-3.5 rounded"
                  />
                  <CapPill cap={cap} risky={HIGH_RISK_CAPS.has(cap)} />
                </label>
              ))}
            </div>
          </div>

          {/* Resource limits */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-foreground-500">
                Max tokens/day (optional)
              </label>
              <input
                type="number"
                value={form.maxTokensPerDay}
                onChange={(e) =>
                  setForm((f) => ({ ...f, maxTokensPerDay: e.target.value }))
                }
                placeholder="e.g. 100000"
                className="w-full px-3 py-2 bg-background-200 border border-neutral-200 rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-foreground-500">
                Max requests/hour (optional)
              </label>
              <input
                type="number"
                value={form.maxRequestsPerHour}
                onChange={(e) =>
                  setForm((f) => ({ ...f, maxRequestsPerHour: e.target.value }))
                }
                placeholder="e.g. 60"
                className="w-full px-3 py-2 bg-background-200 border border-neutral-200 rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          {/* Expiry */}
          <div className="space-y-1">
            <label className="text-xs text-foreground-500">
              Expires at (optional)
            </label>
            <input
              type="datetime-local"
              value={form.expiresAt}
              onChange={(e) =>
                setForm((f) => ({ ...f, expiresAt: e.target.value }))
              }
              className="w-full px-3 py-2 bg-background-200 border border-neutral-200 rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <button
            onClick={handleCreate}
            disabled={
              creating || !form.agentDid || form.capabilities.length === 0
            }
            className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {creating ? (
              <div className="w-3.5 h-3.5 border border-white/50 border-t-white rounded-full animate-spin" />
            ) : (
              <Plus size={14} />
            )}
            Create policy
          </button>
        </div>
      </div>

      {/* Active policies list */}
      <div className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            Active policies ({policies.length})
          </h3>
        </div>
        {policies.length === 0 ? (
          <div className="px-4 py-10 text-center text-foreground-500 text-sm">
            No active policies. All agents are currently locked.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-xs text-foreground-400 uppercase tracking-wider">
                <th className="px-4 py-2 text-left">Agent</th>
                <th className="px-4 py-2 text-left">Capabilities</th>
                <th className="px-4 py-2 text-left">Limits</th>
                <th className="px-4 py-2 text-left">Expires</th>
                <th className="px-4 py-2 text-left">Created</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {policies.map((p) => {
                const agentName = agents.find((a) => a.did === p.agentDid)?.name;
                return (
                  <tr
                    key={p.id}
                    className="hover:bg-background-200/40 transition-colors"
                  >
                    <td
                      className="px-4 py-2.5 font-mono text-xs text-foreground-500"
                      title={p.agentDid ?? ""}
                    >
                      {agentName ??
                        (p.agentDid ? (
                          shortDid(p.agentDid)
                        ) : (
                          <span className="italic">global</span>
                        ))}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {p.capabilities.map((c) => (
                          <CapPill
                            key={c}
                            cap={c}
                            risky={HIGH_RISK_CAPS.has(c)}
                          />
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-foreground-500">
                      {p.resourceLimits ? (
                        <span>
                          {p.resourceLimits.maxTokensPerDay
                            ? `${formatCompactNumber(p.resourceLimits.maxTokensPerDay)} tok/d`
                            : ""}
                          {p.resourceLimits.maxRequestsPerHour
                            ? ` · ${p.resourceLimits.maxRequestsPerHour} req/h`
                            : ""}
                        </span>
                      ) : (
                        <span className="text-foreground-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-foreground-500">
                      {formatDateTime(p.expiresAt)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-foreground-500">
                      {timeAgo(p.createdAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setRenewPolicy(p)}
                          className="p-1.5 rounded-lg text-foreground-400 hover:text-primary-500 hover:bg-primary-500/10 transition-colors"
                          title="Renew policy"
                        >
                          <RotateCcw size={13} />
                        </button>
                        <button
                          onClick={() => handleRevoke(p.id)}
                          disabled={revoking === p.id}
                          className="p-1.5 rounded-lg text-foreground-400 hover:text-danger-400 hover:bg-danger-500/10 transition-colors disabled:opacity-40"
                          title="Revoke policy"
                        >
                          {revoking === p.id ? (
                            <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Trash2 size={13} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Uncovered agents */}
      {agents.filter((a) => !coveredDids.has(a.did)).length > 0 && (
        <div className="bg-warning-50 border border-warning-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-warning-500/20">
            <h3 className="text-sm font-semibold text-warning-700 flex items-center gap-2">
              <ShieldOff className="w-4 h-4" /> Locked agents — no active policy
            </h3>
          </div>
          <div className="divide-y divide-warning-500/10">
            {agents
              .filter((a) => !coveredDids.has(a.did))
              .map((a) => (
                <div
                  key={a.did}
                  className="px-4 py-2.5 flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm text-foreground font-medium">
                      {a.name}
                    </p>
                    <p className="text-xs font-mono text-foreground-500">
                      {shortDid(a.did)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {a.capabilities.map((c) => (
                      <CapPill key={c} cap={c} risky={HIGH_RISK_CAPS.has(c)} />
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Renew policy modal */}
      {renewPolicy && (
        <RenewPolicyModal
          policy={renewPolicy}
          agentName={agents.find((a) => a.did === renewPolicy.agentDid)?.name}
          onClose={() => setRenewPolicy(null)}
          onRenewed={fetchAll}
        />
      )}

      {/* Token budgets */}
      <div className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-200">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Gauge className="w-4 h-4 text-primary-700" /> Token budgets per
            agent
          </h3>
        </div>
        {agents.length === 0 ? (
          <div className="px-4 py-8 text-center text-foreground-500 text-sm">
            No agents found.
          </div>
        ) : (
          <div className="divide-y divide-neutral-200">
            {agents.map((a) => {
              const edit = budgetEdits[a.did];
              const todayTokenUsage = a.tokenHistory.find(
                (h) => h.granularity === "day"
              );
              const todayTokens = todayTokenUsage
                ? todayTokenUsage.completionTokens + todayTokenUsage.promptTokens
                : 0;
              const monthTokenUsage = a.tokenHistory.find(
                (h) => h.granularity === "month"
              );
              const monthTokens = monthTokenUsage
                ? monthTokenUsage.completionTokens + monthTokenUsage.promptTokens
                : 0;
              const dailyVal =
                edit?.daily ??
                (a.tokenBudgetDaily !== null ? String(a.tokenBudgetDaily) : "");
              const monthlyVal =
                edit?.monthly ??
                (a.tokenBudgetMonthly !== null
                  ? String(a.tokenBudgetMonthly)
                  : "");
              const dirty = edit !== undefined;

              return (
                <div key={a.did} className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {a.name}
                      </p>
                      <p className="text-xs font-mono text-foreground-500">
                        {shortDid(a.did)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        <label className="text-xs text-foreground-400">
                          Daily
                        </label>
                        <input
                          type="number"
                          value={dailyVal}
                          placeholder="Unlimited"
                          onChange={(e) =>
                            setBudgetEdits((prev) => ({
                              ...prev,
                              [a.did]: {
                                daily: e.target.value,
                                monthly: prev[a.did]?.monthly ?? monthlyVal,
                              },
                            }))
                          }
                          className="w-28 px-2 py-1 text-xs bg-background-200 border border-neutral-200 rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <label className="text-xs text-foreground-400">
                          Monthly
                        </label>
                        <input
                          type="number"
                          value={monthlyVal}
                          placeholder="Unlimited"
                          onChange={(e) =>
                            setBudgetEdits((prev) => ({
                              ...prev,
                              [a.did]: {
                                daily: prev[a.did]?.daily ?? dailyVal,
                                monthly: e.target.value,
                              },
                            }))
                          }
                          className="w-28 px-2 py-1 text-xs bg-background-200 border border-neutral-200 rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                      </div>
                      {dirty && (
                        <button
                          onClick={() => handleSaveBudget(a.did)}
                          disabled={savingBudget === a.did}
                          className="px-2.5 py-1 text-xs bg-primary-600 text-white rounded-md hover:bg-primary-500 disabled:opacity-40 transition-colors"
                        >
                          {savingBudget === a.did ? "Saving…" : "Save"}
                        </button>
                      )}
                    </div>
                  </div>
                  {a.tokenBudgetDaily !== null && todayTokens > 0 && (
                    <BudgetBar
                      used={todayTokens}
                      budget={a.tokenBudgetDaily}
                      label="Today"
                    />
                  )}
                  {a.tokenBudgetMonthly !== null && monthTokens > 0 && (
                    <BudgetBar
                      used={monthTokens}
                      budget={a.tokenBudgetMonthly}
                      label="This month"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
