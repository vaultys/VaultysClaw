import { Activity, Info, ShieldCheck } from "lucide-react";
import type { HookAuditEvent } from "@prisma/client";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { HookAuditDAO, HookCoverageDAO } from "@/db";
import type { HookCoverageRecord } from "@/db/hook-coverage.dao";
import type { CoverageLevel } from "@/lib/hook-audit";

/**
 * The agent re-sends an unchanged report every 10 minutes; past this, the
 * report is shown as stale rather than as the host's current state.
 */
const COVERAGE_STALE_MS = 30 * 60 * 1000;

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
  const [events, summary, coverage] = await Promise.all([
    HookAuditDAO.recent(did, { limit: 50, decisionsOnly: true }),
    HookAuditDAO.summary(did, since),
    HookCoverageDAO.get(did),
  ]);
  if (summary.lastAt === null && coverage === null) return null;

  return (
    <>
      {coverage && <CoverageSection coverage={coverage} />}
      {summary.lastAt !== null && (
        <DecisionsSection events={events} summary={{ ...summary, lastAt: summary.lastAt }} />
      )}
    </>
  );
}

function DecisionsSection({
  events,
  summary,
}: {
  events: HookAuditEvent[];
  summary: Awaited<ReturnType<typeof HookAuditDAO.summary>> & { lastAt: Date };
}) {
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

const LEVEL: Record<CoverageLevel, { label: string; tone: BadgeTone }> = {
  enforcing: { label: "Enforcing", tone: "positive" },
  partial: { label: "Partial", tone: "attention" },
  observe: { label: "Observe only", tone: "caution" },
  ungoverned: { label: "Ungoverned", tone: "negative" },
};

/**
 * Per-harness coverage, as computed on the host by the same code `doctor`
 * prints. The console never upgrades it: an unknown level was already read as
 * ungoverned on arrival, and a report that has gone quiet is labelled stale
 * rather than left looking current.
 */
function CoverageSection({ coverage }: { coverage: HookCoverageRecord }) {
  const stale = Date.now() - coverage.reportedAt.getTime() > COVERAGE_STALE_MS;
  return (
    <section className="space-y-4 border border-neutral-200/60 rounded-xl bg-background-100 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-foreground flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-foreground-500" strokeWidth={1.5} />
          Harness coverage
        </h2>
        <span className="text-xs text-foreground-500 flex items-center gap-2">
          {stale && <Badge tone="caution">Stale</Badge>}
          Reported {coverage.reportedAt.toLocaleString()}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge tone={coverage.mode === "enforce" ? "positive" : "caution"}>
          {coverage.mode === "enforce" ? "Enforce mode" : coverage.mode === "observe" ? "Observe mode" : "Mode unknown"}
        </Badge>
        {coverage.tamperResistant ? (
          <Badge tone="positive">Machine scope</Badge>
        ) : (
          <Badge tone="caution">User scope — removable by the governed user</Badge>
        )}
      </div>

      {stale && (
        <p className="text-xs text-foreground-600">
          No report for over 30 minutes. The host may be offline or its agent stopped; this is the last state it
          reported, not necessarily its current one.
        </p>
      )}

      {coverage.vendors.length === 0 ? (
        <p className="text-xs text-foreground-500">No supported coding harness found on this host.</p>
      ) : (
        <ul className="divide-y divide-neutral-200/40">
          {coverage.vendors.map((v) => {
            const l = LEVEL[v.level] ?? LEVEL.ungoverned;
            return (
              <li key={v.vendor} className="py-2 flex gap-3 items-start">
                <span className="w-28 shrink-0 text-xs font-mono text-foreground-700">{v.vendor}</span>
                <Badge tone={l.tone}>{l.label}</Badge>
                {v.reasons.length > 0 && (
                  <ul className="text-xs text-foreground-600 space-y-0.5 list-disc pl-4">
                    {v.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
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
