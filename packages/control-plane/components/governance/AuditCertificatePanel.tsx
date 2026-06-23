import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Key,
  Zap,
  Clock,
  Loader2,
} from "lucide-react";
import type { AuditEntryDetail, AuditCertInfo } from "@/lib/contracts";
import { JsonBlock } from "./JsonBlock";
import { CopyButton } from "./CopyButton";
import { CAPABILITY_ICONS, CERT_STATE_LABELS, formatAuditDate } from "./constants";
import type { SigState } from "./useIntentSignatureVerification";

export function AuditCertificatePanel({
  entry,
  certInfo,
  sigState,
  sigHash,
}: {
  entry: AuditEntryDetail;
  certInfo: AuditCertInfo | null;
  sigState: SigState;
  sigHash: string | null;
}) {
  const isActivity = entry.source === "activity";

  return (
    <div className="bg-background-100 border border-neutral-200 rounded-xl p-5 space-y-4">
      <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <ShieldCheck size={14} className="text-foreground-500" /> Certificate &
        Cryptographic State
      </h2>

      {!certInfo ? (
        <div className="text-xs text-foreground-400 italic py-4 text-center">
          {entry.agentDid
            ? "No certificate on file for this agent yet."
            : "No agent DID associated with this entry."}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Cert state summary */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              {
                label: "Protocol state",
                value: (
                  <span
                    className={`font-semibold ${
                      certInfo.state === 2
                        ? "text-success-600"
                        : certInfo.state !== null && certInfo.state < 0
                          ? "text-danger-600"
                          : "text-warning-600"
                    }`}
                  >
                    {certInfo.state !== null
                      ? (CERT_STATE_LABELS[certInfo.state] ??
                        `State ${certInfo.state}`)
                      : "—"}
                  </span>
                ),
              },
              {
                label: "Protocol",
                value: (
                  <span className="font-mono">{certInfo.protocol ?? "—"}</span>
                ),
              },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="bg-background-200 border border-neutral-200 rounded-lg px-3 py-2"
              >
                <div className="text-foreground-400 uppercase text-[10px] mb-0.5">
                  {label}
                </div>
                <div className="text-foreground">{value}</div>
              </div>
            ))}
          </div>

          {/* Signature verification status */}
          {certInfo.signatureVerified ? (
            <div className="flex items-center gap-2.5 bg-success-50 border border-success-300 rounded-lg px-4 py-3">
              <CheckCircle2 size={16} className="text-success-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-success-700">
                  Signature verified
                </p>
                <p className="text-xs text-success-600/80">
                  Mutual challenge-response completed — both parties signed
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 bg-warning-50 border border-warning-300 rounded-lg px-4 py-3">
              <AlertTriangle size={16} className="text-warning-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-warning-700">
                  Signature not verified
                </p>
                <p className="text-xs text-warning-600/80">
                  Handshake incomplete or failed
                </p>
              </div>
            </div>
          )}

          {/* DIDs */}
          <div className="space-y-2">
            <p className="text-xs text-foreground-500 uppercase tracking-wider flex items-center gap-1.5">
              <Key size={11} /> Signing parties
            </p>
            {[
              { label: "pk1 — Control plane", did: certInfo.pk1Did },
              { label: "pk2 — Agent", did: certInfo.pk2Did },
            ].map(({ label, did }) => (
              <div
                key={label}
                className="bg-background-200 border border-neutral-200 rounded-lg px-3 py-2 text-xs space-y-0.5"
              >
                <div className="text-foreground-400 uppercase text-[10px]">
                  {label}
                </div>
                <code className="font-mono text-foreground-700 text-[11px] break-all">
                  {did ?? "—"}
                </code>
              </div>
            ))}
          </div>

          {/* Signed payload */}
          {certInfo.signedPayload && (
            <div className="space-y-1.5">
              <p className="text-xs text-foreground-500 uppercase tracking-wider flex items-center gap-1.5">
                <Key size={11} /> Signed payload
              </p>
              <pre className="bg-background border border-neutral-200 rounded-lg p-3 text-[11px] font-mono text-foreground-700 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed max-h-40">
                {certInfo.signedPayload}
              </pre>
            </div>
          )}

          {/* Capabilities in cert */}
          {certInfo.capabilities && certInfo.capabilities.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-foreground-500 uppercase tracking-wider">
                Capabilities in certificate
              </p>
              <div className="flex flex-wrap gap-1.5">
                {certInfo.capabilities.map((cap) => (
                  <span
                    key={cap}
                    className="flex items-center gap-1 bg-primary-100 border border-primary-300 text-primary-700 px-2 py-0.5 rounded text-xs"
                  >
                    {CAPABILITY_ICONS[cap] ?? <Zap size={11} />}
                    {cap.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Resource limits in cert */}
          {certInfo.resourceLimits && (
            <div className="space-y-2">
              <p className="text-xs text-foreground-500 uppercase tracking-wider">
                Resource limits in certificate
              </p>
              <div className="bg-background-200 border border-neutral-200 rounded-lg divide-y divide-neutral-200 text-xs">
                {certInfo.resourceLimits.maxTokensPerDay != null && (
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-foreground-500">Max tokens/day</span>
                    <span className="font-mono text-foreground">
                      {certInfo.resourceLimits.maxTokensPerDay.toLocaleString()}
                    </span>
                  </div>
                )}
                {certInfo.resourceLimits.maxRequestsPerHour != null && (
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-foreground-500">
                      Max requests/hour
                    </span>
                    <span className="font-mono text-foreground">
                      {certInfo.resourceLimits.maxRequestsPerHour}
                    </span>
                  </div>
                )}
                {certInfo.resourceLimits.allowedDomains &&
                  certInfo.resourceLimits.allowedDomains.length > 0 && (
                    <div className="flex justify-between px-3 py-2 gap-4">
                      <span className="text-foreground-500 shrink-0">
                        Allowed domains
                      </span>
                      <span className="font-mono text-foreground text-right break-all">
                        {certInfo.resourceLimits.allowedDomains.join(", ")}
                      </span>
                    </div>
                  )}
              </div>
            </div>
          )}

          {/* Policy reference */}
          {certInfo.policyId && (
            <div className="space-y-2">
              <p className="text-xs text-foreground-500 uppercase tracking-wider">
                Policy reference
              </p>
              <div className="bg-background-200 border border-neutral-200 rounded-lg divide-y divide-neutral-200 text-xs">
                <div className="flex justify-between px-3 py-2">
                  <span className="text-foreground-500">Policy ID</span>
                  <code className="font-mono text-foreground text-[11px]">
                    {certInfo.policyId}
                  </code>
                </div>
                {certInfo.policyExpiresAt && (
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-foreground-500">Expires at</span>
                    <span
                      className={`font-mono text-[11px] ${
                        new Date(certInfo.policyExpiresAt) < new Date()
                          ? "text-danger-600"
                          : "text-foreground"
                      }`}
                    >
                      {formatAuditDate(certInfo.policyExpiresAt)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Cert error */}
          {certInfo.error && (
            <div className="flex items-center gap-2 text-xs text-warning-600 bg-warning-50 border border-warning-200 rounded-lg px-3 py-2">
              <AlertTriangle size={12} />
              <span>Cert error: {certInfo.error}</span>
            </div>
          )}

          {/* Raw metadata (collapsible) */}
          {certInfo.rawMetadata !== null && (
            <JsonBlock
              value={certInfo.rawMetadata}
              label="Raw certificate metadata"
            />
          )}
        </div>
      )}

      {/* ── Intent signature ─────────────────────────────────────────── */}
      {!isActivity && (
        <div className="pt-2 border-t border-neutral-200">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-foreground-500 uppercase tracking-wider flex items-center gap-1.5">
              <Key size={11} /> Intent signature
            </p>

            {/* Verification badge */}
            {entry.intentSignature && (
              <>
                {sigState === "verifying" && (
                  <span className="flex items-center gap-1 text-[11px] text-foreground-400">
                    <Loader2 size={11} className="animate-spin" /> Verifying…
                  </span>
                )}
                {sigState === "valid" && (
                  <span className="flex items-center gap-1 text-[11px] font-medium text-success-600">
                    <CheckCircle2 size={12} /> Verified by browser
                  </span>
                )}
                {sigState === "invalid" && (
                  <span className="flex items-center gap-1 text-[11px] font-medium text-danger-600">
                    <XCircle size={12} /> Invalid
                  </span>
                )}
                {sigState === "no_key" && (
                  <span className="flex items-center gap-1 text-[11px] text-foreground-400">
                    <AlertTriangle size={11} /> No key to verify
                  </span>
                )}
              </>
            )}
          </div>

          {/* Hash or absent notice */}
          {sigHash ? (
            <div className="mt-1.5 flex items-center gap-2">
              <code className="text-[11px] font-mono text-foreground-600 tracking-wide break-all">
                {sigHash}
              </code>
              <CopyButton text={sigHash} label="Copy hash" />
            </div>
          ) : !entry.intentSignature ? (
            <p className="mt-1 text-[11px] text-foreground-400 italic">
              Not signed — dispatched before signing was enabled.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
