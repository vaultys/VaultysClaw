"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Plus,
  ShieldCheck,
  X,
  AlertTriangle,
  RotateCcw,
  Trash2,
  TrendingUp,
  Clock,
  Globe,
  CalendarDays,
  Activity,
  FileText,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Zap,
} from "lucide-react";
import { formatDateTime, parseUTC, timeAgo } from "@vaultysclaw/shared";
import { CAPABILITY_ICONS } from "./capability-icons";
import { ALL_CAPABILITIES, AUDIT_LABELS } from "./constants";
import type { PolicyEntry, AuditEntry } from "./types";

const EMPTY_LIMITS = {
  maxTokensPerDay: "",
  maxRequestsPerHour: "",
  allowedDomains: "",
};

const AUDIT_PAGE_SIZE = 20;

export function GovernanceTab({
  did,
  agentCapabilities,
}: {
  did: string;
  agentCapabilities: string[];
}) {
  const [policies, setPolicies] = useState<PolicyEntry[]>([]);
  const [loadingPolicies, setLoadingPolicies] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [formCaps, setFormCaps] = useState<string[]>([...agentCapabilities]);
  const [formLimits, setFormLimits] = useState(EMPTY_LIMITS);
  const [formExpiry, setFormExpiry] = useState("");
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [revoking, setRevoking] = useState<string | null>(null);
  const [renewTarget, setRenewTarget] = useState<PolicyEntry | null>(null);
  const [renewExpiry, setRenewExpiry] = useState("");
  const [renewRevokeOriginal, setRenewRevokeOriginal] = useState(true);
  const [renewSaving, setRenewSaving] = useState(false);
  const [renewError, setRenewError] = useState<string | null>(null);

  const openRenew = (p: PolicyEntry) => {
    const suggestExpiry = () => {
      const pad = (n: number) => String(n).padStart(2, "0");
      let ms = 30 * 86_400_000;
      if (p.expiresAt) {
        const rem = parseUTC(p.expiresAt).getTime() - Date.now();
        ms = Math.max(86_400_000, rem);
      }
      const d = new Date(Date.now() + ms);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    setRenewTarget(p);
    setRenewExpiry(suggestExpiry());
    setRenewRevokeOriginal(true);
    setRenewError(null);
  };

  const confirmRenew = async () => {
    if (!renewTarget) return;
    setRenewSaving(true);
    setRenewError(null);
    try {
      const rl =
        renewTarget.resourceLimits &&
        Object.keys(renewTarget.resourceLimits).length > 0
          ? renewTarget.resourceLimits
          : undefined;
      const res = await fetch("/api/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentDid: renewTarget.agentDid,
          capabilities: renewTarget.capabilities,
          resourceLimits: rl,
          expiresAt: renewExpiry
            ? new Date(renewExpiry).toISOString()
            : undefined,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setRenewError(d.error ?? `HTTP ${res.status}`);
        return;
      }
      if (renewRevokeOriginal) {
        await fetch(`/api/policies/${encodeURIComponent(renewTarget.id)}`, {
          method: "DELETE",
        });
      }
      setRenewTarget(null);
      await fetchPolicies();
    } finally {
      setRenewSaving(false);
    }
  };

  const router = useRouter();
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditSourceFilter, setAuditSourceFilter] = useState<
    "" | "activity" | "intent"
  >("");
  const [auditStatusFilter, setAuditStatusFilter] = useState<
    "" | "success" | "failed"
  >("");
  const [auditPage, setAuditPage] = useState(0);

  const fetchAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const params = new URLSearchParams({ agentDid: did, limit: "200" });
      if (auditSourceFilter) params.set("source", auditSourceFilter);
      if (auditStatusFilter) params.set("status", auditStatusFilter);
      const res = await fetch(`/api/governance/audit?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setAuditEntries(data.entries ?? []);
        setAuditPage(0);
      }
    } finally {
      setAuditLoading(false);
    }
  }, [did, auditSourceFilter, auditStatusFilter]);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  const fetchPolicies = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/policies?agentDid=${encodeURIComponent(did)}`
      );
      if (res.ok) {
        const data = await res.json();
        setPolicies(data.policies ?? []);
      }
    } finally {
      setLoadingPolicies(false);
    }
  }, [did]);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

  const openForm = () => {
    setFormCaps([...agentCapabilities]);
    setFormLimits(EMPTY_LIMITS);
    setFormExpiry("");
    setFormError(null);
    setShowForm(true);
  };

  const savePolicy = async () => {
    if (formCaps.length === 0) {
      setFormError("Select at least one capability.");
      return;
    }
    setFormSaving(true);
    setFormError(null);
    try {
      const resourceLimits: Record<string, unknown> = {};
      if (formLimits.maxTokensPerDay !== "")
        resourceLimits.maxTokensPerDay = Number(formLimits.maxTokensPerDay);
      if (formLimits.maxRequestsPerHour !== "")
        resourceLimits.maxRequestsPerHour = Number(
          formLimits.maxRequestsPerHour
        );
      if (formLimits.allowedDomains.trim() !== "") {
        resourceLimits.allowedDomains = formLimits.allowedDomains
          .split(",")
          .map((d) => d.trim())
          .filter(Boolean);
      }
      const body: Record<string, unknown> = {
        agentDid: did,
        capabilities: formCaps,
        resourceLimits:
          Object.keys(resourceLimits).length > 0 ? resourceLimits : undefined,
        expiresAt:
          formExpiry !== "" ? new Date(formExpiry).toISOString() : undefined,
      };
      const res = await fetch("/api/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      setShowForm(false);
      await fetchPolicies();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to create policy");
    } finally {
      setFormSaving(false);
    }
  };

  const revokePolicy = async (id: string) => {
    setRevoking(id);
    try {
      await fetch(`/api/policies/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      await fetchPolicies();
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Policies</h2>
          <p className="text-xs text-foreground-500 mt-0.5">
            Policies define which capabilities and resource limits are embedded
            in the agent&apos;s certificate. Creating or revoking a policy
            immediately triggers a certificate reissue for connected agents.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={openForm}
            className="flex items-center gap-1.5 text-xs bg-primary-600 hover:bg-primary-500 text-white px-3 py-1.5 rounded-md transition-colors"
          >
            <Plus size={13} /> New Policy
          </button>
        )}
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-background-200 border border-neutral-200 rounded-xl p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              New Policy
            </h3>
            <button
              onClick={() => setShowForm(false)}
              className="text-foreground-500 hover:text-foreground"
            >
              <X size={16} />
            </button>
          </div>

          <div>
            <p className="text-xs text-foreground-500 uppercase mb-2">
              Capabilities
            </p>
            <div className="flex flex-wrap gap-2">
              {ALL_CAPABILITIES.map((cap) => {
                const active = formCaps.includes(cap.id);
                return (
                  <button
                    key={cap.id}
                    type="button"
                    onClick={() =>
                      setFormCaps(
                        active
                          ? formCaps.filter((c) => c !== cap.id)
                          : [...formCaps, cap.id]
                      )
                    }
                    className={`px-3 py-1.5 rounded-md text-sm border transition-colors flex items-center gap-1.5 ${
                      active
                        ? "bg-primary-100 border-primary-500 text-primary-700"
                        : "bg-background-100 border-neutral-300 text-foreground-500 hover:border-foreground-500"
                    }`}
                  >
                    {CAPABILITY_ICONS[cap.id] ?? <Zap size={14} />}
                    {cap.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xs text-foreground-500 uppercase mb-2">
              Resource Limits{" "}
              <span className="normal-case text-foreground-400">(optional)</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-xs text-foreground-500">
                  Max tokens / day
                </span>
                <input
                  type="number"
                  min={0}
                  placeholder="e.g. 50000"
                  value={formLimits.maxTokensPerDay}
                  onChange={(e) =>
                    setFormLimits((l) => ({
                      ...l,
                      maxTokensPerDay: e.target.value,
                    }))
                  }
                  className="w-full bg-background-100 border border-neutral-300 rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:border-primary-500"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-foreground-500">
                  Max requests / hour
                </span>
                <input
                  type="number"
                  min={0}
                  placeholder="e.g. 60"
                  value={formLimits.maxRequestsPerHour}
                  onChange={(e) =>
                    setFormLimits((l) => ({
                      ...l,
                      maxRequestsPerHour: e.target.value,
                    }))
                  }
                  className="w-full bg-background-100 border border-neutral-300 rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:border-primary-500"
                />
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs text-foreground-500">
                  Allowed domains{" "}
                  <span className="text-foreground-400">(comma-separated)</span>
                </span>
                <input
                  type="text"
                  placeholder="e.g. api.openai.com, example.com"
                  value={formLimits.allowedDomains}
                  onChange={(e) =>
                    setFormLimits((l) => ({
                      ...l,
                      allowedDomains: e.target.value,
                    }))
                  }
                  className="w-full bg-background-100 border border-neutral-300 rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:border-primary-500"
                />
              </label>
            </div>
          </div>

          <label className="block space-y-1">
            <span className="text-xs text-foreground-500 uppercase">
              Expiry{" "}
              <span className="normal-case text-foreground-400">(optional)</span>
            </span>
            <input
              type="datetime-local"
              value={formExpiry}
              onChange={(e) => setFormExpiry(e.target.value)}
              className="bg-background-100 border border-neutral-300 rounded-md px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary-500"
            />
          </label>

          {formError && (
            <p className="text-xs text-danger-600 flex items-center gap-1.5">
              <AlertTriangle size={13} />
              {formError}
            </p>
          )}

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowForm(false)}
              className="text-xs text-foreground-500 hover:text-foreground px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              onClick={savePolicy}
              disabled={formSaving}
              className="flex items-center gap-1.5 text-xs bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white px-4 py-1.5 rounded-md transition-colors"
            >
              {formSaving ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <ShieldCheck size={13} />
              )}
              {formSaving ? "Applying…" : "Apply Policy"}
            </button>
          </div>
        </div>
      )}

      {/* Policy list */}
      {loadingPolicies ? (
        <div className="flex items-center gap-2 text-foreground-500 text-sm py-4">
          <Loader2 size={14} className="animate-spin" /> Loading policies…
        </div>
      ) : policies.length === 0 ? (
        <div className="text-center py-10 text-foreground-500 text-sm border border-dashed border-neutral-200 rounded-xl">
          <ShieldCheck size={28} className="mx-auto mb-2 opacity-30" />
          No active policies. Create one above to grant capabilities and set
          limits.
        </div>
      ) : (
        <div className="space-y-3">
          {policies.map((p) => (
            <div
              key={p.id}
              className="bg-background-200 border border-neutral-200 rounded-xl p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-3 flex-1 min-w-0">
                  <div className="flex flex-wrap gap-1.5">
                    {p.capabilities.map((cap) => (
                      <span
                        key={cap}
                        className="flex items-center gap-1 bg-primary-100 border border-primary-300 text-primary-700 px-2 py-0.5 rounded text-xs"
                      >
                        {CAPABILITY_ICONS[cap] ?? <Zap size={11} />}
                        {cap.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>

                  {p.resourceLimits &&
                    Object.keys(p.resourceLimits).length > 0 && (
                      <div className="flex flex-wrap gap-3 text-xs text-foreground-500">
                        {p.resourceLimits.maxTokensPerDay != null && (
                          <span className="flex items-center gap-1">
                            <TrendingUp
                              size={11}
                              className="text-warning-600"
                            />
                            {p.resourceLimits.maxTokensPerDay.toLocaleString()}{" "}
                            tokens/day
                          </span>
                        )}
                        {p.resourceLimits.maxRequestsPerHour != null && (
                          <span className="flex items-center gap-1">
                            <Clock size={11} className="text-warning-600" />
                            {p.resourceLimits.maxRequestsPerHour} req/h
                          </span>
                        )}
                        {p.resourceLimits.allowedDomains &&
                          p.resourceLimits.allowedDomains.length > 0 && (
                            <span className="flex items-center gap-1">
                              <Globe size={11} className="text-warning-600" />
                              {p.resourceLimits.allowedDomains.join(", ")}
                            </span>
                          )}
                      </div>
                    )}

                  <div className="flex flex-wrap gap-3 text-xs text-foreground-400">
                    <span>Created {timeAgo(p.createdAt)}</span>
                    {p.createdBy && (
                      <span>
                        by{" "}
                        <code className="font-mono">
                          {p.createdBy.slice(0, 20)}…
                        </code>
                      </span>
                    )}
                    {p.expiresAt && (
                      <span className="flex items-center gap-1">
                        <CalendarDays size={11} />
                        {formatDateTime(p.expiresAt)}
                      </span>
                    )}
                    <code className="font-mono text-foreground-400/60">
                      {p.id}
                    </code>
                  </div>
                </div>

                <div className="flex-shrink-0 flex items-center gap-1.5">
                  <button
                    onClick={() => openRenew(p)}
                    className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-500 border border-primary-300 hover:border-primary-400 px-2.5 py-1.5 rounded-md transition-colors"
                    title="Renew policy"
                  >
                    <RotateCcw size={12} /> Renew
                  </button>
                  <button
                    onClick={() => revokePolicy(p.id)}
                    disabled={revoking === p.id}
                    className="flex items-center gap-1.5 text-xs text-danger-600 hover:text-danger-500 border border-danger-300 hover:border-danger-400 px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-50"
                  >
                    {revoking === p.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Trash2 size={12} />
                    )}
                    Revoke
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Renew modal */}
      {renewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-background-100 border border-neutral-200 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <RotateCcw size={15} className="text-primary-500" /> Renew
                policy
              </span>
              <button
                onClick={() => setRenewTarget(null)}
                className="text-foreground-400 hover:text-foreground p-1 rounded-lg hover:bg-background-200 transition-colors"
              >
                <X size={15} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="bg-background-200 border border-neutral-200 rounded-xl p-3 space-y-2">
                <div className="flex flex-wrap gap-1">
                  {renewTarget.capabilities.map((cap) => (
                    <span
                      key={cap}
                      className="flex items-center gap-1 bg-primary-100 border border-primary-300 text-primary-700 px-2 py-0.5 rounded text-xs"
                    >
                      {CAPABILITY_ICONS[cap] ?? <Zap size={11} />}
                      {cap.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
                {renewTarget.resourceLimits &&
                  (renewTarget.resourceLimits.maxTokensPerDay ||
                    renewTarget.resourceLimits.maxRequestsPerHour) && (
                    <p className="text-xs text-foreground-500">
                      {renewTarget.resourceLimits.maxTokensPerDay
                        ? `${renewTarget.resourceLimits.maxTokensPerDay.toLocaleString()} tok/d`
                        : ""}
                      {renewTarget.resourceLimits.maxTokensPerDay &&
                      renewTarget.resourceLimits.maxRequestsPerHour
                        ? " · "
                        : ""}
                      {renewTarget.resourceLimits.maxRequestsPerHour
                        ? `${renewTarget.resourceLimits.maxRequestsPerHour} req/h`
                        : ""}
                    </p>
                  )}
                {renewTarget.expiresAt && (
                  <p className="text-xs text-warning-600">
                    Original expiry: {formatDateTime(renewTarget.expiresAt)}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-foreground-500 font-medium">
                  New expiry date
                </label>
                <input
                  type="datetime-local"
                  value={renewExpiry}
                  onChange={(e) => setRenewExpiry(e.target.value)}
                  className="w-full px-3 py-2 bg-background-200 border border-neutral-200 rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <div className="flex gap-1.5 mt-1">
                  {([7, 30, 90, 365] as const).map((days) => {
                    const pad = (n: number) => String(n).padStart(2, "0");
                    const d = new Date(Date.now() + days * 86_400_000);
                    const val = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                    return (
                      <button
                        key={days}
                        type="button"
                        onClick={() => setRenewExpiry(val)}
                        className="text-[11px] px-2 py-0.5 rounded-md border border-neutral-200 text-foreground-500 hover:text-primary-600 hover:border-primary-400 transition-colors"
                      >
                        +{days}d
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={renewRevokeOriginal}
                  onChange={(e) => setRenewRevokeOriginal(e.target.checked)}
                  className="w-4 h-4 rounded accent-primary-600"
                />
                <span className="text-xs text-foreground-500 group-hover:text-foreground transition-colors">
                  Revoke original policy after renewal
                </span>
              </label>
              {renewError && (
                <p className="text-xs text-danger-500">{renewError}</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-neutral-200">
              <button
                onClick={() => setRenewTarget(null)}
                className="px-3 py-1.5 text-sm text-foreground-500 hover:text-foreground border border-neutral-200 rounded-lg hover:bg-background-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmRenew}
                disabled={renewSaving || !renewExpiry}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {renewSaving ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <RotateCcw size={13} />
                )}
                Renew policy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Audit Trail ── */}
      <div className="space-y-3 pt-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Activity size={14} className="text-foreground-500" /> Audit Trail
            </h2>
            <p className="text-xs text-foreground-500 mt-0.5">
              All activity and intent events for this agent. Click any row for
              full detail.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex rounded-md overflow-hidden border border-neutral-300 text-xs">
              {(["", "activity", "intent"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setAuditSourceFilter(s)}
                  className={`px-2.5 py-1 transition-colors ${
                    auditSourceFilter === s
                      ? "bg-primary-600 text-white"
                      : "bg-background-100 text-foreground-500 hover:text-foreground"
                  }`}
                >
                  {s === "" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            <div className="flex rounded-md overflow-hidden border border-neutral-300 text-xs">
              {(["", "success", "failed"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setAuditStatusFilter(s)}
                  className={`px-2.5 py-1 transition-colors ${
                    auditStatusFilter === s
                      ? "bg-primary-600 text-white"
                      : "bg-background-100 text-foreground-500 hover:text-foreground"
                  }`}
                >
                  {s === ""
                    ? "Any status"
                    : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            <button
              onClick={fetchAudit}
              className="text-xs text-foreground-500 hover:text-foreground px-2 py-1 rounded-md border border-neutral-300 bg-background-100 transition-colors"
              title="Refresh"
            >
              ↻
            </button>
          </div>
        </div>

        {auditLoading ? (
          <div className="flex items-center gap-2 text-foreground-500 text-sm py-6 justify-center">
            <Loader2 size={14} className="animate-spin" /> Loading audit trail…
          </div>
        ) : auditEntries.length === 0 ? (
          <div className="text-center py-10 text-foreground-500 text-sm border border-dashed border-neutral-200 rounded-xl">
            <Activity size={28} className="mx-auto mb-2 opacity-30" />
            No audit events found for this agent.
          </div>
        ) : (
          (() => {
            const totalPages = Math.ceil(auditEntries.length / AUDIT_PAGE_SIZE);
            const page = Math.min(auditPage, totalPages - 1);
            const slice = auditEntries.slice(
              page * AUDIT_PAGE_SIZE,
              (page + 1) * AUDIT_PAGE_SIZE
            );
            return (
              <div className="space-y-2">
                <div className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-neutral-200">
                        <th className="text-left text-foreground-400 uppercase tracking-wider px-3 py-2 font-medium w-24">
                          Source
                        </th>
                        <th className="text-left text-foreground-400 uppercase tracking-wider px-3 py-2 font-medium">
                          Event
                        </th>
                        <th className="text-left text-foreground-400 uppercase tracking-wider px-3 py-2 font-medium w-24">
                          Status
                        </th>
                        <th className="text-left text-foreground-400 uppercase tracking-wider px-3 py-2 font-medium w-36">
                          Time
                        </th>
                        <th className="w-6" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200">
                      {slice.map((entry) => {
                        const isActivity = entry.source === "activity";
                        return (
                          <tr
                            key={entry.id}
                            onClick={() =>
                              router.push(
                                `/governance/audit/${encodeURIComponent(entry.id)}`
                              )
                            }
                            className="cursor-pointer hover:bg-background-200 transition-colors group"
                          >
                            <td className="px-3 py-2.5">
                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                                  isActivity
                                    ? "bg-primary-100 text-primary-700 border-primary-300"
                                    : "bg-secondary-100 text-secondary-700 border-secondary-300"
                                }`}
                              >
                                {isActivity ? (
                                  <Activity size={9} />
                                ) : (
                                  <FileText size={9} />
                                )}
                                {entry.source}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-foreground">
                              {AUDIT_LABELS[entry.event] ??
                                entry.event.replace(/_/g, " ")}
                            </td>
                            <td className="px-3 py-2.5">
                              {entry.status === "success" && (
                                <span className="flex items-center gap-1 text-success-700">
                                  <CheckCircle2 size={11} /> success
                                </span>
                              )}
                              {entry.status === "failed" && (
                                <span className="flex items-center gap-1 text-danger-600">
                                  <XCircle size={11} /> failed
                                </span>
                              )}
                              {entry.status &&
                                entry.status !== "success" &&
                                entry.status !== "failed" && (
                                  <span className="flex items-center gap-1 text-warning-600">
                                    <Clock size={11} /> {entry.status}
                                  </span>
                                )}
                              {!entry.status && (
                                <span className="text-foreground-400">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-foreground-500">
                              {timeAgo(entry.timestamp)}
                            </td>
                            <td className="pr-3">
                              <ChevronRight
                                size={13}
                                className="text-foreground-400 opacity-0 group-hover:opacity-100 transition-opacity"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between text-xs text-foreground-500 px-1">
                    <span>
                      {auditEntries.length} events · page {page + 1} of{" "}
                      {totalPages}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setAuditPage(Math.max(0, page - 1))}
                        disabled={page === 0}
                        className="px-2.5 py-1 rounded border border-neutral-300 bg-background-100 hover:text-foreground disabled:opacity-40 transition-colors"
                      >
                        ‹ Prev
                      </button>
                      <button
                        onClick={() =>
                          setAuditPage(Math.min(totalPages - 1, page + 1))
                        }
                        disabled={page >= totalPages - 1}
                        className="px-2.5 py-1 rounded border border-neutral-300 bg-background-100 hover:text-foreground disabled:opacity-40 transition-colors"
                      >
                        Next ›
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()
        )}
      </div>
    </div>
  );
}
