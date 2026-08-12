"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, XCircle, Copy } from "lucide-react";
import { testSsoConnectionAction } from "./actions";

/**
 * Create/edit form for an SSO connection, shared by `new/` and `[id]/`.
 *
 * Entra ID asks for a tenant ID and derives the issuer from it; generic OIDC
 * asks for the issuer directly. That is the *entire* difference between the two
 * — everything downstream is one OIDC code path — so this is one form with a
 * kind switch rather than two panels, which is also what stops the two drifting.
 */
export default function SsoConnectionForm({
  action,
  connection,
  callbackUrl,
  submitLabel,
}: {
  action: (formData: FormData) => void;
  connection?: {
    id: string;
    kind: string;
    name: string;
    issuer: string;
    clientId: string;
    tenantId: string | null;
  };
  /** Only known once the connection exists (it embeds the id). */
  callbackUrl?: string;
  submitLabel: string;
}) {
  const isEdit = !!connection;
  const [kind, setKind] = useState(connection?.kind ?? "oidc");
  const [issuer, setIssuer] = useState(connection?.issuer ?? "");
  const [tenantId, setTenantId] = useState(connection?.tenantId ?? "");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; issuer: string; error?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const isEntra = kind === "entra";

  async function onTest() {
    setTesting(true);
    setResult(null);
    try {
      setResult(await testSsoConnectionAction(kind, isEntra ? tenantId : issuer));
    } catch (err) {
      setResult({
        ok: false,
        issuer: "",
        error: err instanceof Error ? err.message : "Failed",
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <form action={action} className="space-y-6 max-w-2xl">
      {isEdit && <input type="hidden" name="id" value={connection.id} />}
      <input type="hidden" name="kind" value={kind} />

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Provider type</label>
        {/* Fixed after creation: it decides where the issuer comes from, and
            switching it on an existing row would silently repoint every identity
            already bound through it at a different directory. */}
        <div className="flex gap-2">
          {[
            { id: "oidc", label: "Generic OIDC" },
            { id: "entra", label: "Microsoft Entra ID" },
          ].map((option) => (
            <button
              key={option.id}
              type="button"
              disabled={isEdit}
              onClick={() => {
                setKind(option.id);
                setResult(null);
              }}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors disabled:opacity-60 ${
                kind === option.id
                  ? "bg-primary-100 text-primary-700 border-primary-200"
                  : "border-neutral-200 text-foreground-500 hover:bg-background-200/60"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {isEdit && (
          <p className="text-xs text-foreground-400 mt-1">
            Type can&apos;t be changed after creation — create a second connection instead.
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Display name</label>
        <input
          type="text"
          name="name"
          required
          defaultValue={connection?.name}
          placeholder={isEntra ? "Microsoft" : "Acme SSO"}
          className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
        />
        <p className="text-xs text-foreground-400 mt-1">
          The label on the sign-in button.
        </p>
      </div>

      {isEntra ? (
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Tenant ID</label>
          <input
            type="text"
            name="tenantId"
            required
            value={tenantId}
            onChange={(e) => {
              setTenantId(e.target.value);
              setResult(null);
            }}
            placeholder="00000000-0000-0000-0000-000000000000"
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background font-mono"
          />
          <p className="text-xs text-foreground-400 mt-1">
            Your directory (tenant) ID from the Azure portal. The issuer is derived from it:{" "}
            <code className="font-mono">
              https://login.microsoftonline.com/&lt;tenant&gt;/v2.0
            </code>
          </p>
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Issuer URL</label>
          <input
            type="text"
            name="issuer"
            required
            value={issuer}
            onChange={(e) => {
              setIssuer(e.target.value);
              setResult(null);
            }}
            placeholder="https://accounts.example.com"
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background font-mono"
          />
          <p className="text-xs text-foreground-400 mt-1">
            The base URL — <code className="font-mono">/.well-known/openid-configuration</code> is
            appended automatically. Pasting the full discovery URL works too.
          </p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Client ID</label>
        <input
          type="text"
          name="clientId"
          required
          defaultValue={connection?.clientId}
          className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background font-mono"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Client secret</label>
        <input
          type="password"
          name="clientSecret"
          required={!isEdit}
          placeholder={isEdit ? "Leave blank to keep the current secret" : ""}
          className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background font-mono"
        />
        <p className="text-xs text-foreground-400 mt-1">
          Encrypted at rest and never redisplayed.
        </p>
      </div>

      {callbackUrl && (
        <div className="border border-neutral-200/60 rounded-lg p-3 space-y-1.5">
          <div className="text-sm font-medium text-foreground">Redirect URI</div>
          <p className="text-xs text-foreground-400">
            Register this exact URL at your IdP. A mismatch here is the most common reason a new
            connection fails at the first login.
          </p>
          <div className="flex items-center gap-2">
            <code className="text-xs font-mono text-foreground-600 break-all">{callbackUrl}</code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(callbackUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="text-xs px-2 py-1 border border-neutral-200 rounded hover:bg-background-200/60 transition-colors inline-flex items-center gap-1 shrink-0"
            >
              <Copy className="w-3 h-3" />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      <div className="border border-neutral-200/60 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-foreground-600">
            Check the IdP&apos;s discovery document before saving.
          </div>
          <button
            type="button"
            onClick={onTest}
            disabled={testing || (isEntra ? !tenantId : !issuer)}
            className="text-xs px-3 py-1.5 border border-neutral-200 rounded-lg hover:bg-background-200/60 transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {testing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Test connection
          </button>
        </div>
        {result && (
          <div
            className={`text-xs flex items-start gap-1.5 ${
              result.ok ? "text-success-700" : "text-danger-600"
            }`}
          >
            {result.ok ? (
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            ) : (
              <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            )}
            <div>
              {result.ok ? (
                <>
                  Discovery OK at <code className="font-mono">{result.issuer}</code> — authorization,
                  token and JWKS endpoints all present.
                </>
              ) : (
                <>Couldn&apos;t verify: {result.error}</>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
