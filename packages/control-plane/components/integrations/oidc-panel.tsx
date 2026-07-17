"use client";

import { useState, useEffect } from "react";
import {
  ShieldCheck,
  Loader2,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  ExternalLink,
  BookOpen,
  Trash2,
} from "lucide-react";
import { Field, StatusBadge, IntegrationPanel, IntegrationHeader } from "./shared";
import { cn } from "@/lib/utils";
import {
  adminApi,
  unwrap,
} from "@/lib/api/ts-rest/client";
import { useConfirm } from "@/components/shared/ConfirmContext";

interface DiscoveryCheck {
  id: string;
  label: string;
  status: "ok" | "fail";
  detail: string | null;
}

// ─── Setup guide ──────────────────────────────────────────────────────────────

const PILL = "font-mono text-xs bg-primary-100 border border-primary-300 text-primary-700 px-1.5 py-0.5 rounded";
const BOLD = "font-semibold text-foreground";

const STEPS = [
  {
    number: "1",
    title: "Register a new application",
    body: (
      <>
        In your identity provider (Keycloak, Okta, Auth0, Azure AD, Google Workspace, etc.)
        create a new{" "}
        <strong className={BOLD}>Web application</strong> or{" "}
        <strong className={BOLD}>OAuth 2.0 Client</strong>.
      </>
    ),
  },
  {
    number: "2",
    title: "Set the redirect (callback) URL",
    body: (
      <>
        Add the <strong className={BOLD}>Callback URL</strong> shown above to the list of
        allowed redirect URIs. Exact match is usually required.
      </>
    ),
  },
  {
    number: "3",
    title: "Enable the OpenID Connect scopes",
    body: (
      <>
        Make sure the application is allowed to request the{" "}
        <span className={PILL}>openid</span>{" "}
        <span className={PILL}>email</span>{" "}
        <span className={PILL}>profile</span> scopes.
        The ID token must include a <span className={PILL}>sub</span> claim.
      </>
    ),
  },
  {
    number: "4",
    title: "Copy the credentials",
    body: (
      <>
        Copy the <strong className={BOLD}>Issuer URL</strong> (also called the{" "}
        <em>discovery URL</em> base), <strong className={BOLD}>Client ID</strong>, and{" "}
        <strong className={BOLD}>Client Secret</strong> into the fields below.
      </>
    ),
  },
];

function SetupGuide({ callbackUrl }: { callbackUrl: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-primary-200 bg-primary-50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-primary-100/70 transition"
      >
        <BookOpen className="w-4 h-4 text-primary-500 shrink-0" />
        <span className="text-sm font-medium text-primary-700 flex-1">
          How to configure your identity provider
        </span>
        <ChevronRight className={cn("w-4 h-4 text-primary-500 transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <div className="px-4 pb-5 pt-2 space-y-4 border-t border-primary-200">
          {/* Callback URL call-out */}
          <div className="rounded-lg bg-primary-100 border border-primary-300 px-3 py-2.5 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-primary-700 shrink-0">Callback URL</span>
            <code className="text-xs font-mono text-primary-800 break-all flex-1">{callbackUrl}</code>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(callbackUrl)}
              className="text-xs text-primary-600 hover:text-primary-500 transition shrink-0"
            >
              Copy
            </button>
          </div>

          {STEPS.map((step) => (
            <div key={step.number} className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary-200 border border-primary-400 text-primary-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                {step.number}
              </span>
              <div className="text-sm text-neutral-600 leading-relaxed">
                <span className="font-semibold text-neutral-800">{step.title} — </span>
                {step.body}
              </div>
            </div>
          ))}

          <a
            href="https://openid.net/specs/openid-connect-discovery-1_0.html"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-500 transition"
          >
            <ExternalLink className="w-3 h-3" /> OpenID Connect Discovery spec
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function OidcPanel() {
  const confirm = useConfirm();
  const [issuer, setIssuer] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [providerName, setProviderName] = useState("SSO");
  const [secretPlaceholder, setSecretPlaceholder] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [fromEnv, setFromEnv] = useState(false);
  const [configured, setConfigured] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testChecks, setTestChecks] = useState<DiscoveryCheck[] | null>(null);

  const callbackUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/api/auth/callback/oidc`;

  useEffect(() => {
    adminApi.server
      .getOidc()
      .then((res) => {
        const d = unwrap(res) as {
          configured?: boolean;
          fromEnv?: boolean;
          issuer?: string;
          clientId?: string;
          clientSecret?: string;
          providerName?: string;
        };
        setConfigured(!!d.configured);
        setFromEnv(!!d.fromEnv);
        if (d.configured) {
          setIssuer(d.issuer ?? "");
          setClientId(d.clientId ?? "");
          setProviderName(d.providerName ?? "SSO");
          setSecretPlaceholder(d.clientSecret ?? ""); // will be "••••••••"
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setTestChecks(null);
    try {
      unwrap(
        await adminApi.server.saveOidc({
          body: {
            issuer,
            clientId,
            clientSecret: clientSecret || undefined,
            providerName,
            keepSecret: configured && !clientSecret,
          },
        })
      );
      setSaveStatus("saved");
      setConfigured(true);
      setSecretPlaceholder("••••••••");
      setClientSecret("");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (!issuer.trim()) return;
    setTesting(true);
    setTestChecks(null);
    try {
      const d = unwrap(
        await adminApi.server.testOidc({ body: { issuer } })
      ) as { checks?: DiscoveryCheck[] };
      setTestChecks(d.checks ?? []);
    } catch {
      setTestChecks([{ id: "network", label: "Reach discovery endpoint", status: "fail", detail: "Network error" }]);
    } finally {
      setTesting(false);
    }
  };

  const remove = async () => {
    if (
      !(await confirm({
        title: "Remove OIDC",
        message:
          "Remove OIDC configuration? Users who signed in via SSO will still exist but cannot log in until OIDC is reconfigured.",
        variant: "danger",
      }))
    )
      return;
    setRemoving(true);
    try {
      unwrap(await adminApi.server.removeOidc());
      setConfigured(false);
      setIssuer("");
      setClientId("");
      setClientSecret("");
      setSecretPlaceholder("");
      setProviderName("SSO");
      setTestChecks(null);
    } catch {
      /* ignore */
    } finally {
      setRemoving(false);
    }
  };

  return (
    <IntegrationPanel>
      <IntegrationHeader
        icon={ShieldCheck}
        title="OIDC / Generic SSO"
        description="OpenID Connect single sign-on"
      />
      <form onSubmit={save} className="p-5 space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-foreground-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            {fromEnv && (
              <div className="rounded-lg bg-warning-50 border border-warning-300 px-4 py-3 text-sm text-warning-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                OIDC is configured via environment variables (<code className="font-mono text-xs">OIDC_ISSUER</code>,{" "}
                <code className="font-mono text-xs">OIDC_CLIENT_ID</code>,{" "}
                <code className="font-mono text-xs">OIDC_CLIENT_SECRET</code>). These values are read-only in the UI.
              </div>
            )}

            <SetupGuide callbackUrl={callbackUrl} />

            {/* Callback URL summary row */}
            <div className="rounded-lg bg-background-200 border border-neutral-200 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs font-medium text-foreground-500 uppercase tracking-wider">Callback URL</p>
                <code className="text-xs font-mono text-foreground break-all">{callbackUrl}</code>
              </div>
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(callbackUrl)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-background-100 border border-neutral-300 hover:border-primary-500 text-foreground transition"
              >
                Copy
              </button>
            </div>

            <Field
              label="Issuer URL"
              id="oidc-issuer"
              value={issuer}
              onChange={setIssuer}
              placeholder="https://accounts.example.com"
              disabled={fromEnv}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Client ID"
                id="oidc-client-id"
                value={clientId}
                onChange={setClientId}
                placeholder="your-client-id"
                disabled={fromEnv}
              />
              <Field
                label="Provider name"
                id="oidc-provider-name"
                value={providerName}
                onChange={setProviderName}
                placeholder="SSO"
                disabled={fromEnv}
              />
            </div>
            <Field
              label={configured ? "Client Secret (leave blank to keep current)" : "Client Secret"}
              id="oidc-client-secret"
              value={clientSecret}
              onChange={setClientSecret}
              placeholder={configured ? secretPlaceholder : "your-client-secret"}
              showToggle
              disabled={fromEnv}
            />

            {!fromEnv && (
              <div className="flex items-center gap-3 flex-wrap pt-1">
                <button
                  type="submit"
                  disabled={saving || !issuer || !clientId}
                  className="px-4 py-1.5 text-xs font-medium rounded-lg bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-40 transition flex items-center gap-1.5"
                >
                  {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                  {configured ? "Update" : "Save"}
                </button>

                {issuer && (
                  <button
                    type="button"
                    onClick={testConnection}
                    disabled={testing}
                    className="px-4 py-1.5 text-xs font-medium rounded-lg bg-background-200 border border-neutral-300 hover:border-foreground-500 text-foreground disabled:opacity-40 transition flex items-center gap-1.5"
                  >
                    {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                    Test connection
                  </button>
                )}

                {configured && (
                  <button
                    type="button"
                    onClick={remove}
                    disabled={removing}
                    className="px-4 py-1.5 text-xs font-medium rounded-lg bg-background-200 border border-danger-300 hover:border-danger-500 text-danger-600 disabled:opacity-40 transition flex items-center gap-1.5 ml-auto"
                  >
                    {removing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    Remove
                  </button>
                )}

                {saveStatus === "saved" && <StatusBadge status="success" message="Saved" />}
                {saveStatus === "error" && <StatusBadge status="error" message="Save failed" />}
              </div>
            )}

            {/* Test results */}
            {testChecks && (
              <div className="rounded-lg border border-neutral-200 overflow-hidden">
                {testChecks.map((check, i) => (
                  <div
                    key={check.id}
                    className={cn("px-4 py-3 space-y-1", i < testChecks.length - 1 && "border-b border-neutral-200")}
                  >
                    <div className="flex items-center gap-2">
                      {check.status === "ok"
                        ? <CheckCircle className="w-4 h-4 text-success-500 shrink-0" />
                        : <AlertCircle className="w-4 h-4 text-danger-500 shrink-0" />}
                      <span className={cn("text-sm font-medium", check.status === "ok" ? "text-success-700" : "text-danger-700")}>
                        {check.label}
                      </span>
                    </div>
                    {check.detail && (
                      <p className="text-xs text-neutral-500 pl-6 font-mono break-all leading-relaxed">{check.detail}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Status row */}
            <div className="rounded-lg border border-neutral-200 bg-background-200 px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Status</p>
                <p className="text-xs text-foreground-500">
                  {configured
                    ? `SSO login is active — button label: "${providerName || "SSO"}"`
                    : "OIDC is not configured — VaultysId-only login"}
                </p>
              </div>
              {configured ? (
                <StatusBadge status="success" message="Active" />
              ) : (
                <StatusBadge status="warning" message="Not configured" />
              )}
            </div>
          </>
        )}
      </form>
    </IntegrationPanel>
  );
}
