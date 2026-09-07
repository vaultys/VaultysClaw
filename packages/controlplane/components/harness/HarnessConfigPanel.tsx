import { AlertTriangle, Info, ShieldBan, Trash2 } from "lucide-react";
import type { Actor } from "@prisma/client";
import { buildActorConfig } from "@/lib/actor-config";
import { parseHarnessKindConfig } from "@/lib/harness-kind";
import { getWSServerInstance } from "@/lib/ws-server";
import {
  addHarnessResourceRuleAction,
  deleteHarnessResourceRuleAction,
  updateHarnessSettingsAction,
} from "@/app/admin/actors/actions";
import { ProxyActionForm } from "@/components/proxy/ProxyForms";

/**
 * The `kind: "harness"` extension panel on the Actor detail page
 * (docs/HARNESS_SUPERVISOR.md).
 *
 * The proxy panel's sibling, and it reuses `ProxyActionForm` rather than growing
 * a second copy — that component exists because a Server Action which *throws*
 * renders Next.js's generic error page and discards the message, which is a
 * property of the framework, not of the proxy kind.
 *
 * Three things this panel is deliberately loud about, because each produces a
 * deployment that looks governed and is not:
 *
 *  1. **What is actually being enforced.** `observe` decides and records and
 *     refuses nothing; without OS confinement even `explicit` is advisory,
 *     because a subprocess or an edited harness config bypasses the hook.
 *  2. **Whose machine this is.** Unlike a proxy in a rack, a harness supervisor
 *     usually runs on a person's laptop, and a rule here can stop them working.
 *  3. **Whether a change has reached it**, or is waiting for a reconnect.
 */
export default async function HarnessConfigPanel({ actor }: { actor: Actor }) {
  const connected = getWSServerInstance()?.isConnected(actor.did) ?? false;

  // A stored config that no longer parses must not render as an empty one — that
  // would show "no rules" and "observe" for a harness whose policy simply failed
  // to load, which is the most misleading possible reading.
  let config;
  let parseError: string | null = null;
  try {
    config = parseHarnessKindConfig(actor.kindConfig);
  } catch (err) {
    parseError = err instanceof Error ? err.message : String(err);
  }

  // The same builder the push uses, so this renders exactly the warning set the
  // supervisor will act under — not a second, drifting approximation.
  let warnings: string[] = [];
  if (!parseError) {
    try {
      warnings = (await buildActorConfig(actor.did))?.warnings ?? [];
    } catch (err) {
      warnings = [err instanceof Error ? err.message : String(err)];
    }
  }

  return (
    <section className="space-y-4 border border-neutral-200/60 rounded-xl bg-background-100 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground-700 flex items-center gap-1.5">
          <ShieldBan className="w-3.5 h-3.5 text-danger-500" />
          Harness supervision
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
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          This Actor governs a coding harness at the tool-call boundary: every file read, file write
          and command is decided locally from its certificate and the rules below, with no round trip
          to this control plane. It typically runs on a person&apos;s own machine, so a rule here can
          stop them working — and a rule that is too broad is the reason the supervisor gets turned
          off.
        </span>
      </p>

      {parseError && (
        <p role="alert" className="text-xs text-danger-700 bg-danger-100 border border-danger-200 rounded-lg px-3 py-2 flex gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            This harness&apos;s stored configuration could not be read, so nothing below reflects
            what it is enforcing: {parseError}
          </span>
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
            action={updateHarnessSettingsAction}
            className="grid grid-cols-1 sm:grid-cols-6 gap-3 items-end"
          >
            <input type="hidden" name="did" value={actor.did} />
            <label className="sm:col-span-2 text-xs text-foreground-600">
              Mode
              <select
                name="mode"
                defaultValue={config.mode}
                className="mt-1 w-full text-sm rounded-lg border border-neutral-200 bg-background-50 px-2 py-1.5"
              >
                <option value="observe">observe — decide and record, refuse nothing</option>
                <option value="explicit">explicit — refuse anything uncovered</option>
              </select>
            </label>
            <label className="sm:col-span-2 text-xs text-foreground-600">
              OS confinement
              <select
                name="sandbox"
                defaultValue={config.sandbox}
                className="mt-1 w-full text-sm rounded-lg border border-neutral-200 bg-background-50 px-2 py-1.5"
              >
                <option value="off">off — advisory only</option>
                <option value="auto">auto — confine where possible</option>
                <option value="require">require — refuse to launch without it</option>
              </select>
            </label>
            <label className="sm:col-span-2 text-xs text-foreground-600">
              Max status age (s)
              <input
                name="maxStatusAgeSeconds"
                defaultValue={config.maxStatusAgeSeconds}
                inputMode="numeric"
                className="mt-1 w-full text-sm rounded-lg border border-neutral-200 bg-background-50 px-2 py-1.5"
              />
              <span className="block mt-1 text-foreground-400">
                0 is the strictest value, not the loosest. Negative means unbounded.
              </span>
            </label>
            <div className="sm:col-span-6">
              <button
                type="submit"
                className="text-xs px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
              >
                Save settings
              </button>
            </div>
          </ProxyActionForm>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-foreground-600">
              Resource rules ({config.resourceRules.length})
            </h3>
            {config.resourceRules.length === 0 ? (
              <p className="text-xs text-foreground-400">
                None. Every call is decided by the certificate alone, plus whatever local safety floor
                the host is configured with.
              </p>
            ) : (
              <ul className="divide-y divide-neutral-200/60 border border-neutral-200/60 rounded-lg">
                {config.resourceRules.map((rule) => (
                  <li key={rule.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground-700">
                        <span
                          className={`mr-2 px-1.5 py-0.5 rounded border text-[10px] uppercase ${
                            rule.effect === "deny"
                              ? "bg-danger-100 text-danger-700 border-danger-200"
                              : "bg-success-100 text-success-700 border-success-200"
                          }`}
                        >
                          {rule.effect}
                        </span>
                        {rule.id}
                      </p>
                      <p className="text-xs text-foreground-500 font-mono truncate">
                        {rule.resources.join("  ")}
                      </p>
                    </div>
                    <form action={deleteHarnessResourceRuleAction}>
                      <input type="hidden" name="did" value={actor.did} />
                      <input type="hidden" name="ruleId" value={rule.id} />
                      <button
                        type="submit"
                        aria-label={`Delete rule ${rule.id}`}
                        className="text-foreground-400 hover:text-danger-600 p-1"
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
            action={addHarnessResourceRuleAction}
            className="grid grid-cols-1 sm:grid-cols-6 gap-3 items-end border-t border-neutral-200/60 pt-3"
          >
            <input type="hidden" name="did" value={actor.did} />
            <label className="sm:col-span-2 text-xs text-foreground-600">
              Rule id
              <input
                name="id"
                required
                placeholder="deny-ssh-keys"
                className="mt-1 w-full text-sm rounded-lg border border-neutral-200 bg-background-50 px-2 py-1.5"
              />
            </label>
            <label className="sm:col-span-3 text-xs text-foreground-600">
              Resources
              <input
                name="resources"
                required
                placeholder="file:///Users/fx/.ssh/*, exec://docker"
                className="mt-1 w-full text-sm rounded-lg border border-neutral-200 bg-background-50 px-2 py-1.5 font-mono"
              />
              <span className="block mt-1 text-foreground-400">
                An exact URI, or a prefix ending <code>/*</code>. Paths must be as the host resolves
                them — copy them from <code>vaultysclaw-sensor report</code>, which prints the
                resolved form the matcher actually sees.
              </span>
            </label>
            <label className="sm:col-span-1 text-xs text-foreground-600">
              Effect
              <select
                name="effect"
                defaultValue="deny"
                className="mt-1 w-full text-sm rounded-lg border border-neutral-200 bg-background-50 px-2 py-1.5"
              >
                <option value="deny">deny</option>
                <option value="allow">allow</option>
              </select>
            </label>
            <div className="sm:col-span-6">
              <button
                type="submit"
                className="text-xs px-3 py-1.5 rounded-lg border border-neutral-200 hover:bg-background-200"
              >
                Add rule
              </button>
              <span className="ml-2 text-xs text-foreground-400">
                An <code>allow</code> rule bypasses the certificate entirely — it is not a scope, it
                is an exemption.
              </span>
            </div>
          </ProxyActionForm>
        </>
      )}
    </section>
  );
}
