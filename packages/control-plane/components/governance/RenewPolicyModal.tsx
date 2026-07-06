import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { shortDid, daysFromNow, formatCompactNumber } from "@vaultysclaw/shared";
import { policiesClient, unwrap } from "@/lib/api/ts-rest/client";
import type { PolicyEntry } from "@/lib/contracts";
import { CapPill } from "./CapPill";
import { HIGH_RISK_CAPS, suggestRenewalExpiry } from "./constants";

export function RenewPolicyModal({
  policy,
  agentName,
  onClose,
  onRenewed,
}: {
  policy: PolicyEntry;
  agentName: string | undefined;
  onClose: () => void;
  onRenewed: () => void;
}) {
  const [newExpiry, setNewExpiry] = useState(() =>
    suggestRenewalExpiry(policy.expiresAt)
  );
  const [revokeOriginal, setRevokeOriginal] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRenew = async () => {
    setSaving(true);
    setError(null);
    try {
      const resourceLimits =
        policy.resourceLimits && Object.keys(policy.resourceLimits).length > 0
          ? policy.resourceLimits
          : undefined;

      unwrap(
        await policiesClient.create({
          body: {
            agentDid: policy.agentDid ?? undefined,
            workspaceId: policy.workspaceId ?? undefined,
            capabilities: policy.capabilities,
            resourceLimits: resourceLimits as
              | Record<string, unknown>
              | undefined,
            expiresAt: newExpiry
              ? new Date(newExpiry).toISOString()
              : undefined,
          },
        })
      );

      if (revokeOriginal) {
        await policiesClient.remove({ params: { id: policy.id } });
      }

      onRenewed();
      onClose();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to create renewed policy"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-background-100 border border-neutral-200 rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
          <div className="flex items-center gap-2 text-foreground">
            <RotateCcw className="w-4 h-4 text-primary-500" />
            <h2 className="font-semibold text-sm">Renew policy</h2>
          </div>
          <button
            onClick={onClose}
            className="text-foreground-400 hover:text-foreground transition-colors p-1 rounded-lg hover:bg-background-200"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Policy summary (read-only) */}
          <div className="bg-background-200 border border-neutral-200 rounded-xl p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-foreground-400">Agent</span>
              <span className="text-xs font-medium text-foreground">
                {agentName ??
                  (policy.agentDid ? (
                    shortDid(policy.agentDid)
                  ) : (
                    <span className="italic">global</span>
                  ))}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-xs text-foreground-400 shrink-0">
                Capabilities
              </span>
              <div className="flex flex-wrap gap-1 justify-end">
                {policy.capabilities.map((c) => (
                  <CapPill key={c} cap={c} risky={HIGH_RISK_CAPS.has(c)} />
                ))}
              </div>
            </div>
            {policy.resourceLimits &&
              (policy.resourceLimits.maxTokensPerDay ||
                policy.resourceLimits.maxRequestsPerHour) && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-foreground-400">Limits</span>
                  <span className="text-xs text-foreground-500">
                    {policy.resourceLimits.maxTokensPerDay
                      ? `${formatCompactNumber(policy.resourceLimits.maxTokensPerDay)} tok/d`
                      : ""}
                    {policy.resourceLimits.maxTokensPerDay &&
                    policy.resourceLimits.maxRequestsPerHour
                      ? " · "
                      : ""}
                    {policy.resourceLimits.maxRequestsPerHour
                      ? `${policy.resourceLimits.maxRequestsPerHour} req/h`
                      : ""}
                  </span>
                </div>
              )}
            {policy.expiresAt && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-foreground-400">
                  Original expiry
                </span>
                <span className="text-xs text-warning-600">
                  {new Date(
                    policy.expiresAt.endsWith("Z")
                      ? policy.expiresAt
                      : policy.expiresAt + "Z"
                  ).toLocaleString()}
                </span>
              </div>
            )}
          </div>

          {/* New expiry picker */}
          <div className="space-y-1.5">
            <label className="text-xs text-foreground-500 font-medium">
              New expiry date
            </label>
            <input
              type="datetime-local"
              value={newExpiry}
              onChange={(e) => setNewExpiry(e.target.value)}
              className="w-full px-3 py-2 bg-background-200 border border-neutral-200 rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <div className="flex gap-2 mt-1">
              {[7, 30, 90, 365].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setNewExpiry(daysFromNow(d))}
                  className="text-[11px] px-2 py-0.5 rounded-md border border-neutral-200 text-foreground-500 hover:text-primary-600 hover:border-primary-400 transition-colors"
                >
                  +{d}d
                </button>
              ))}
            </div>
          </div>

          {/* Revoke original checkbox */}
          <label className="flex items-center gap-2.5 cursor-pointer group">
            <input
              type="checkbox"
              checked={revokeOriginal}
              onChange={(e) => setRevokeOriginal(e.target.checked)}
              className="w-4 h-4 rounded accent-primary-600"
            />
            <span className="text-xs text-foreground-500 group-hover:text-foreground transition-colors">
              Revoke original policy after renewal
            </span>
          </label>

          {error && <p className="text-xs text-danger-500">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-neutral-200">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-foreground-500 hover:text-foreground border border-neutral-200 rounded-lg hover:bg-background-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleRenew}
            disabled={saving || !newExpiry}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? (
              <div className="w-3.5 h-3.5 border border-white/50 border-t-white rounded-full animate-spin" />
            ) : (
              <RotateCcw size={13} />
            )}
            Renew policy
          </button>
        </div>
      </div>
    </div>
  );
}
