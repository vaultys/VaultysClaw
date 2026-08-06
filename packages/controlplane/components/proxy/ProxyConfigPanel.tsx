import { AlertTriangle, Info, ShieldBan, Trash2 } from "lucide-react";
import type { Actor } from "@prisma/client";
import { buildActorConfig } from "@/lib/actor-config";
import { parseProxyKindConfig } from "@/lib/proxy-kind";
import { getWSServerInstance } from "@/lib/ws-server";
import {
  addProxyRuleAction,
  deleteProxyRuleAction,
  updateProxySettingsAction,
} from "@/app/admin/actors/actions";
import { ProxyActionForm } from "./ProxyForms";

/**
 * The `kind: "proxy"` extension panel on the Actor detail page
 * (docs/REBUILD_ARCHITECTURE.md §4.3's per-kind admin panel,
 * docs/PROXY_ARCHITECTURE.md §12).
 *
 * A Server Component that reads and renders everything; the two editing forms
 * are wrapped in `ProxyForms.tsx`'s thin Client Component purely so a validation
 * error can be shown in place. Every other section of this page uses a plain
 * `<form action={serverAction}>`, and that was the first attempt here too — but a
 * Server Action that throws renders Next.js's generic error page and discards
 * the message, so the reason a rule was refused never reached the admin. A rule
 * list is still add/remove rather than an editable table, to keep the rest of the
 * panel state-free.
 *
 * Three things this panel is deliberately loud about, because each is a state
 * where the proxy enforces less than an admin would assume and looks identical
 * to one that is working:
 *
 *  1. Zone semantics (§4.2) — a proxy governs everything pointed at it, so two
 *     agents behind one proxy are indistinguishable to the decision. Presenting
 *     it as if it governed a single agent is the exact quiet overclaim that makes
 *     a governance product untrustworthy.
 *  2. Whether it holds a verifiable (packcert) certificate at all.
 *  3. Whether a change has actually reached it, or is waiting for a reconnect.
 */
export default async function ProxyConfigPanel({ actor }: { actor: Actor }) {
  const connected = getWSServerInstance()?.isConnected(actor.did) ?? false;

  // A stored config that no longer parses must not render as an empty one — that
  // would show "no rules" for a proxy whose rules simply failed to load.
  let config;
  let parseError: string | null = null;
  try {
    config = parseProxyKindConfig(actor.kindConfig);
  } catch (err) {
    parseError = err instanceof Error ? err.message : String(err);
  }

  // `buildActorConfig` is the same builder the push uses and already folds in
  // `proxyKindConfigWarnings`, so this renders exactly the set the agent will act
  // on — not a second, drifting approximation, and not the same problem stated
  // twice in different words.
  let warnings: string[] = [];
  if (!parseError) {
    try {
      const built = await buildActorConfig(actor.did);
      warnings = built?.warnings ?? [];
    } catch (err) {
      warnings = [err instanceof Error ? err.message : String(err)];
    }
  }

  return (
    <section className="space-y-4 border border-neutral-200/60 rounded-xl bg-background-100 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground-700 flex items-center gap-1.5">
          <ShieldBan className="w-3.5 h-3.5 text-danger-500" />
          Interception
        </h2>
        <span
          className={`text-xs px-2 py-0.5 rounded-full border ${
            connected
              ? "bg-success-100 text-success-700 border-success-200"
              : "bg-neutral-100 text-foreground-500 border-neutral-200"
          }`}
        >
          {connected ? "connected — changes apply immediately" : "offline — changes apply on reconnect"}
        </span>
      </div>

      <p className="text-xs text-foreground-500 flex gap-1.5">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-foreground-400" />
        <span>
          This proxy governs <strong className="text-foreground-600">every request pointed at it</strong>, as
          one zone — not one agent. Two agents behind it are indistinguishable to the decision, so a
          certificate granting internet access grants it to all of them. Finer granularity means deploying
          more proxies.
        </span>
      </p>

      {parseError && (
        <p className="text-xs text-danger-700 bg-danger-100 border border-danger-200 rounded-lg px-3 py-2">
          <strong>This proxy&apos;s stored configuration is invalid and is not being pushed:</strong>{" "}
          {parseError}
        </p>
      )}

      {warnings.length > 0 && (
        <ul className="space-y-1.5">
          {warnings.map((w) => (
            <li
              key={w}
              className="text-xs text-warning-700 bg-warning-100 border border-warning-200 rounded-lg px-3 py-2 flex gap-1.5"
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}

      {config && (
        <>
          <ProxyActionForm
            action={updateProxySettingsAction}
            className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"
          >
            <input type="hidden" name="did" value={actor.did} />

            <label className="text-xs text-foreground-500 space-y-1 block">
              <span>Mode</span>
              <select
                name="mode"
                defaultValue={config.mode}
                className="w-full border border-neutral-200 rounded-lg px-3 py-1.5 text-sm bg-background text-foreground"
              >
                <option value="explicit">explicit — agents point here</option>
                <option value="system">system — host proxy settings (not implemented)</option>
              </select>
            </label>

            <label className="text-xs text-foreground-500 space-y-1 block">
              <span>Max status age (seconds)</span>
              <input
                type="number"
                step="1"
                name="maxStatusAgeSeconds"
                defaultValue={config.maxStatusAgeSeconds}
                className="w-full border border-neutral-200 rounded-lg px-3 py-1.5 text-sm bg-background text-foreground font-mono"
              />
            </label>

            <label className="text-xs text-foreground-500 space-y-1 block">
              <span>Listen address (informational)</span>
              <input
                type="text"
                name="listenAddr"
                defaultValue={config.listenAddr ?? ""}
                placeholder="127.0.0.1:8888"
                className="w-full border border-neutral-200 rounded-lg px-3 py-1.5 text-sm bg-background text-foreground font-mono"
              />
            </label>

            <p className="sm:col-span-3 text-xs text-foreground-400">
              Max status age <strong>0</strong> is the strictest setting, not the loosest: it means no cached
              certificate status is acceptable, and a proxy decides offline, so with fail-closed it denies
              everything. Use a <strong>negative</strong> value for unbounded.
            </p>

            <div className="sm:col-span-3">
              <button
                type="submit"
                className="px-3 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
              >
                Save settings
              </button>
            </div>
          </ProxyActionForm>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-foreground-600">
              Rules{" "}
              <span className="font-normal text-foreground-400">
                — an explicit deny always wins over an allow, whatever the order
              </span>
            </h3>

            {config.rules.length === 0 ? (
              <p className="text-sm text-foreground-400">
                No rules. Every request is decided by this proxy&apos;s certificate alone.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {config.rules.map((rule) => (
                  <li
                    key={rule.id}
                    className="flex items-center gap-2 text-sm border border-neutral-200/60 rounded-lg px-3 py-2 bg-background"
                  >
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded border font-medium shrink-0 ${
                        rule.effect === "deny"
                          ? "bg-danger-100 text-danger-700 border-danger-200"
                          : "bg-success-100 text-success-700 border-success-200"
                      }`}
                    >
                      {rule.effect}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded border bg-neutral-100 text-foreground-600 border-neutral-200 shrink-0">
                      {rule.subject}
                      {rule.workloadId ? `:${rule.workloadId}` : ""}
                    </span>
                    <span className="font-mono text-xs text-foreground truncate">
                      {rule.hosts.join(", ")}
                      {rule.ports && rule.ports.length > 0 ? `  :${rule.ports.join(",")}` : ""}
                    </span>
                    <span className="text-xs text-foreground-400 ml-auto shrink-0">{rule.id}</span>
                    <form action={deleteProxyRuleAction} className="shrink-0">
                      <input type="hidden" name="did" value={actor.did} />
                      <input type="hidden" name="ruleId" value={rule.id} />
                      <button
                        type="submit"
                        aria-label={`Delete rule ${rule.id}`}
                        className="p-1 text-foreground-400 hover:text-danger-600 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <ProxyActionForm
            action={addProxyRuleAction}
            className="grid grid-cols-1 sm:grid-cols-6 gap-2 items-end border-t border-neutral-200/60 pt-3"
          >
            <input type="hidden" name="did" value={actor.did} />

            <label className="text-xs text-foreground-500 space-y-1 block sm:col-span-1">
              <span>Effect</span>
              <select
                name="effect"
                className="w-full border border-neutral-200 rounded-lg px-2 py-1.5 text-sm bg-background text-foreground"
              >
                <option value="deny">deny</option>
                <option value="allow">allow</option>
              </select>
            </label>

            <label className="text-xs text-foreground-500 space-y-1 block sm:col-span-1">
              <span>Subject</span>
              <select
                name="subject"
                className="w-full border border-neutral-200 rounded-lg px-2 py-1.5 text-sm bg-background text-foreground"
              >
                <option value="any">any</option>
                <option value="agent">agent</option>
                <option value="workload">workload</option>
              </select>
            </label>

            <label className="text-xs text-foreground-500 space-y-1 block sm:col-span-1">
              <span>Workload id</span>
              <input
                type="text"
                name="workloadId"
                placeholder="subject: workload only"
                className="w-full border border-neutral-200 rounded-lg px-2 py-1.5 text-sm bg-background text-foreground font-mono"
              />
            </label>

            <label className="text-xs text-foreground-500 space-y-1 block sm:col-span-1">
              <span>Hosts</span>
              <input
                type="text"
                name="hosts"
                required
                placeholder=".openai.com"
                className="w-full border border-neutral-200 rounded-lg px-2 py-1.5 text-sm bg-background text-foreground font-mono"
              />
            </label>

            <label className="text-xs text-foreground-500 space-y-1 block sm:col-span-1">
              <span>Ports</span>
              <input
                type="text"
                name="ports"
                placeholder="any"
                className="w-full border border-neutral-200 rounded-lg px-2 py-1.5 text-sm bg-background text-foreground font-mono"
              />
            </label>

            <label className="text-xs text-foreground-500 space-y-1 block sm:col-span-1">
              <span>Rule id</span>
              <input
                type="text"
                name="id"
                required
                placeholder="deny-openai"
                className="w-full border border-neutral-200 rounded-lg px-2 py-1.5 text-sm bg-background text-foreground font-mono"
              />
            </label>

            <p className="sm:col-span-6 text-xs text-foreground-400">
              Hosts are an exact name (<code className="font-mono">api.openai.com</code>) or a dot-prefixed
              suffix (<code className="font-mono">.openai.com</code>, which matches subdomains but not the apex).
              Wildcards are rejected — they would match nothing and produce a rule that silently never fires.
              Separate several with commas.
            </p>

            <div className="sm:col-span-6">
              <button
                type="submit"
                className="px-3 py-1.5 border border-neutral-200 text-foreground text-sm font-medium rounded-lg hover:bg-background-200 transition-colors"
              >
                Add rule
              </button>
            </div>
          </ProxyActionForm>
        </>
      )}
    </section>
  );
}
