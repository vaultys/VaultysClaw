import { Activity, Info } from "lucide-react";
import type { HookAuditEvent } from "@prisma/client";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { HookAuditDAO } from "@/db";

/**
 * Recent tool-call decisions reported by a `kind: "harness"` Actor's
 * vaultysclaw-hooks agent (docs/HARNESS_HOOKS.md, `lib/hook-audit.ts`).
 *
 * Two things this panel is careful to say, because each is easy to misread:
 *
 *  - **"Would deny" is not "denied".** In observe mode every call passes; the
 *    record says what enforce mode would have refused. Showing it as a refusal
 *    would make an observing host look like it is enforcing.
 *  - **This is the host's own account.** It arrives from software running as
 *    the governed user. Useful for "what is my policy doing", not proof of it.
 *
 * Renders nothing for a harness that has never reported — a sensor-launched
 * supervisor (vaultysclaw-sensor's supervise role) keeps its trail locally, and
 * an empty "no decisions yet" box on its page would read as "nothing happened".
 */
export default async function HookAuditPanel({ did }: { did: string }) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [events, summary] = await Promise.all([
    HookAuditDAO.recent(did, { limit: 50, decisionsOnly: true }),
    HookAuditDAO.summary(did, since),
  ]);
  if (summary.lastAt === null) return null;

  return (
    <section className="space-y-4 border border-neutral-200/60 rounded-xl bg-background-100 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-foreground flex items-center gap-1.5">
          <Activity className="w-4 h-4 text-foreground-500" strokeWidth={1.5} />
          Tool-call decisions
        </h2>
        <span className="text-xs text-foreground-500">
          Last report {summary.lastAt.toLocaleString()}
        </span>
      </div>

      <p className="text-xs text-foreground-600">
        Last 24 h: {summary.decided} decided · {summary.blocked} blocked · {summary.wouldDeny} would be
        refused · {summary.unmapped} ungoverned (no mapping)
      </p>

      <p className="text-xs leading-5 text-foreground-600 flex gap-1.5">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-foreground-500" strokeWidth={1.5} />
        <span>
          Reported by this host&apos;s vaultysclaw-hooks agent. In observe mode nothing is refused —
          &ldquo;would refuse&rdquo; is what enforce mode would have done. Tool arguments, prompts and
          file contents are never recorded.
        </span>
      </p>

      {events.length === 0 ? (
        <p className="text-xs text-foreground-500">No tool-call decisions reported yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-foreground-500 border-b border-neutral-200/60">
                <th className="py-1.5 pr-3 font-medium">When</th>
                <th className="py-1.5 pr-3 font-medium">Outcome</th>
                <th className="py-1.5 pr-3 font-medium">Tool</th>
                <th className="py-1.5 pr-3 font-medium">Resource</th>
                <th className="py-1.5 font-medium">Why</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const o = outcome(e);
                return (
                  <tr key={e.id} className="border-b border-neutral-200/40 align-top">
                    <td className="py-1.5 pr-3 whitespace-nowrap text-foreground-600">
                      {e.occurredAt.toLocaleTimeString()}
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      <Badge tone={o.tone}>{o.label}</Badge>
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap text-foreground-700">
                      {e.tool ?? "—"}
                      <span className="text-foreground-500"> · {e.vendor}</span>
                    </td>
                    <td className="py-1.5 pr-3 font-mono break-all text-foreground-700">{e.resource ?? "—"}</td>
                    <td className="py-1.5 text-foreground-600 break-words">{e.error ?? e.reason ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function outcome(e: HookAuditEvent): { label: string; tone: BadgeTone } {
  if (e.blocked) return { label: "Blocked", tone: "negative" };
  if (e.wouldDeny) return { label: "Would refuse", tone: "caution" };
  if (e.unmapped) return { label: "Ungoverned", tone: "attention" };
  return { label: "Allowed", tone: "positive" };
}
