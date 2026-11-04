import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, X } from "lucide-react";
import {
  ActorDAO,
  PendingRegistrationDAO,
  CapabilityCertificateDAO,
  AuditLogDAO,
  SettingsDAO,
} from "@/db";
import { getWebhookEvent } from "@vaultysclaw/shared";
import PageChrome from "@/components/layout/PageChrome";
import { SETTINGS_KEYS } from "@/lib/org-settings";
import { dismissOnboardingSetupAction } from "./actions";

/**
 * Overview (docs/PAGE_DESIGN.md §1.2) — posture summary, guided setup, and
 * links into the source-of-truth pages where operators take action.
 *
 * The chrome stays neutral: orange marks only what is waiting on an operator
 * (a pending queue, an unfinished setup step), so it reads at a glance.
 */
export default async function AdminOverviewPage() {
  const [
    byKind,
    pending,
    awaitingDelivery,
    activeCerts,
    recentActivity,
    onboardingDismissed,
  ] = await Promise.all([
    ActorDAO.countByKind(),
    PendingRegistrationDAO.listPending(),
    PendingRegistrationDAO.listApprovedUndelivered(),
    CapabilityCertificateDAO.countActive(),
    AuditLogDAO.recent(20),
    SettingsDAO.get(SETTINGS_KEYS.adminOnboardingDismissed),
  ]);

  const totalActors = Object.values(byKind).reduce((a, b) => a + b, 0);
  const humanActors = byKind.human ?? 0;
  const sensorActors = byKind.sensor ?? 0;
  const automatedActors = totalActors - humanActors - sensorActors;
  const pendingTotal = pending.length + awaitingDelivery.length;

  const tiles = [
    {
      label: "Actors",
      value: totalActors,
      detail: `${humanActors} human · ${automatedActors} agent or device · ${sensorActors} sensor`,
      href: "/admin/actors",
      attention: false,
    },
    {
      label: "Pending approval",
      value: pendingTotal,
      detail:
        pending.length > 0
          ? "Registration decisions need attention"
          : awaitingDelivery.length > 0
            ? "Approved grants are waiting for reconnect"
            : "Registration queue is clear",
      href: "/admin/actors",
      attention: pendingTotal > 0,
    },
    {
      label: "Active certificates",
      value: activeCerts,
      detail:
        activeCerts > 0
          ? "Capability grants currently usable"
          : "Issue a grant to make access explicit",
      href: "/admin/certificates",
      attention: false,
    },
  ];

  const setupSteps = [
    {
      title: "Invite operators",
      description:
        "Add the people who will approve actors, inspect audit trails, and manage certificate grants.",
      done: totalActors > 1,
      href: "/admin/actors/invite",
      action: "Invite a human",
    },
    {
      title: "Approve new actors",
      description:
        "Review requested capabilities before an agent, device, or server becomes part of the trust graph.",
      done: pendingTotal === 0,
      href: "/admin/actors",
      action: pending.length > 0 ? "Review pending actors" : "Open actors",
    },
    {
      title: "Grant least privilege",
      description: "Certificates define what an actor may do, for which scope, and for how long.",
      done: activeCerts > 0,
      href: "/admin/certificates/new",
      action: "Issue a certificate",
    },
    {
      title: "Wire notifications",
      description:
        "Send signed events to webhooks or notification channels so important changes do not stay hidden.",
      done: recentActivity.length > 0,
      href: "/admin/integrations",
      action: "Configure integrations",
    },
  ];
  const completedSteps = setupSteps.filter((step) => step.done).length;
  const setupComplete = completedSteps === setupSteps.length;
  const showOnboardingSetup = !setupComplete || onboardingDismissed !== "1";

  const attentionItems = [
    pending.length > 0
      ? {
          title: `${pending.length} actor${pending.length === 1 ? "" : "s"} awaiting approval`,
          description: "Approve only the capabilities each actor needs right now.",
          href: "/admin/actors",
        }
      : null,
    awaitingDelivery.length > 0
      ? {
          title: `${awaitingDelivery.length} grant${awaitingDelivery.length === 1 ? "" : "s"} awaiting delivery`,
          description: "These certificates will be delivered when the actor reconnects.",
          href: "/admin/actors",
        }
      : null,
    activeCerts === 0
      ? {
          title: "No active certificates yet",
          description:
            "Actors can register before they are trusted. Issue a certificate to grant access.",
          href: "/admin/certificates/new",
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  const actorMix = Object.entries(byKind).sort(([, a], [, b]) => b - a);
  const largestKind = actorMix[0]?.[1] ?? 0;

  return (
    <div className="p-6 space-y-6">
      <PageChrome
        toolbar={{
          title: "Overview",
          description: "Trust posture, onboarding progress, and the next useful action",
        }}
        breadcrumbs={[{ label: "Overview" }]}
      />

      {showOnboardingSetup && (
        <section className="relative overflow-hidden rounded-xl border border-neutral-200/60 bg-background-100">
          {setupComplete && (
            <form action={dismissOnboardingSetupAction} className="absolute right-3 top-3 z-10">
              <button
                type="submit"
                aria-label="Close onboarding setup"
                title="Close onboarding setup"
                className="rounded-lg p-1.5 text-foreground-400 transition-colors hover:bg-background-200 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </form>
          )}
          <div className="grid lg:grid-cols-[1.4fr_0.9fr]">
            <div className="p-6">
              <p className="text-xs text-foreground-500">Guided setup</p>
              <h2 className="mt-2 text-2xl font-medium text-foreground">
                Build a verifiable operating perimeter
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-foreground-600">
                VaultysClaw starts with identities, then turns explicit approvals into capability
                certificates. This overview keeps the first-run path visible and turns live system
                state into the next thing an operator should do.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Link
                  href={pending.length > 0 ? "/admin/actors" : "/admin/actors/invite"}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-500"
                >
                  {pending.length > 0 ? "Review approvals" : "Start onboarding"}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/admin/certificates"
                  className="inline-flex items-center rounded-lg border border-neutral-200 bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background-200/60"
                >
                  View certificate ledger
                </Link>
              </div>
            </div>
            <div className="flex flex-col justify-center border-t border-neutral-200/60 bg-background-200/30 p-6 lg:border-l lg:border-t-0">
              <p className="text-xs text-foreground-500">Setup progress</p>
              <p className="mt-1 font-mono text-3xl font-medium tabular-nums text-foreground">
                {completedSteps}
                <span className="text-foreground-400"> of {setupSteps.length}</span>
              </p>
              {/* One segment per step, in checklist order: a done step is filled, the
                  rest stay on the ramp — a progress bar, not a ring, since it is one goal. */}
              <div className="mt-4 flex gap-1" aria-hidden>
                {setupSteps.map((step) => (
                  <span
                    key={step.title}
                    className={`h-1.5 flex-1 rounded-sm ${step.done ? "bg-primary-600" : "bg-neutral-200"}`}
                  />
                ))}
              </div>
              <p className="mt-4 text-xs leading-5 text-foreground-500">
                A completed step means the system has real data for that part of the operating loop.
                You can still revisit each area at any time.
              </p>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {tiles.map((tile) => (
          <Link
            key={tile.label}
            href={tile.href}
            className="block rounded-xl border border-neutral-200/60 bg-background-100 p-5 transition-colors hover:border-neutral-300"
          >
            <div className="flex items-center gap-2 text-sm text-foreground-600">
              {tile.attention && (
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary-600" />
              )}
              {tile.label}
            </div>
            <div
              className={`mt-2 font-mono text-3xl font-medium tabular-nums ${tile.attention ? "text-primary-700" : "text-foreground"}`}
            >
              {tile.value.toLocaleString("en-US")}
            </div>
            <p className="mt-2 text-xs leading-5 text-foreground-500">{tile.detail}</p>
          </Link>
        ))}
      </div>

      <div className={`grid gap-6 ${showOnboardingSetup ? "xl:grid-cols-[1fr_360px]" : "xl:grid-cols-2"}`}>
        {showOnboardingSetup && (
          <section className="rounded-xl border border-neutral-200/60 bg-background-100">
            <div className="border-b border-neutral-200/60 px-5 py-4">
              <h2 className="text-sm font-medium text-foreground">Onboarding checklist</h2>
              <p className="mt-1 text-xs leading-5 text-foreground-500">
                Follow this path when you are setting up a workspace or bringing a new team online.
              </p>
            </div>
            <div className="divide-y divide-neutral-200/60">
              {setupSteps.map((step, index) => (
                <Link
                  key={step.title}
                  href={step.href}
                  className="group flex gap-4 px-5 py-4 transition-colors hover:bg-background-200/40"
                >
                  <div className="pt-0.5">
                    {step.done ? (
                      <CheckCircle2 className="h-4 w-4 text-success-600" strokeWidth={1.5} />
                    ) : (
                      <Circle className="h-4 w-4 text-foreground-400" strokeWidth={1.5} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="flex items-baseline gap-2 text-sm font-medium text-foreground">
                      <span className="font-mono text-xs tabular-nums text-foreground-400">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      {step.title}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-foreground-500">{step.description}</p>
                  </div>
                  <div className="hidden items-center gap-1 self-center text-xs font-medium text-foreground-600 transition-colors group-hover:text-primary-700 sm:flex">
                    {step.action}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <aside className="space-y-4">
          <section className="rounded-xl border border-neutral-200/60 bg-background-100 p-5">
            <h2 className="text-sm font-medium text-foreground">Needs attention</h2>
            <p className="mt-1 text-xs leading-5 text-foreground-500">
              Items here are safe to handle from their source page; the overview only points.
            </p>
            <div className="mt-4 space-y-2">
              {attentionItems.length === 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-neutral-200/60 px-3 py-3 text-sm text-foreground-600">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success-600" />
                  Nothing needs attention
                </div>
              )}
              {attentionItems.map((item) => (
                <Link
                  key={item.title}
                  href={item.href}
                  className="flex gap-3 rounded-lg border border-neutral-200/60 px-3 py-3 transition-colors hover:border-neutral-300 hover:bg-background-200/40"
                >
                  <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-600" />
                  <span>
                    <span className="block text-sm font-medium text-foreground">{item.title}</span>
                    <span className="mt-1 block text-xs leading-5 text-foreground-500">
                      {item.description}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-neutral-200/60 bg-background-100 p-5">
            <h2 className="text-sm font-medium text-foreground">Actor mix</h2>
            <p className="mt-1 text-xs leading-5 text-foreground-500">
              A healthy deployment usually has humans for oversight, sensors for observation, and
              agents or devices with narrow certificates.
            </p>
            {actorMix.length === 0 ? (
              <p className="mt-4 text-sm text-foreground-400">No actors registered yet</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {actorMix.map(([kind, count]) => (
                  <li key={kind}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-foreground-700 first-letter:uppercase">{kind}</span>
                      <span className="font-mono text-xs tabular-nums text-foreground-500">
                        {count.toLocaleString("en-US")}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1 rounded-sm bg-neutral-200/60">
                      <div
                        className="h-1 rounded-sm bg-neutral-400"
                        style={{ width: `${Math.max(2, (count / largestKind) * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      <section className="rounded-xl border border-neutral-200/60 bg-background-100">
        <div className="flex items-center justify-between border-b border-neutral-200/60 px-5 py-4">
          <div>
            <h2 className="text-sm font-medium text-foreground">Recent activity</h2>
            <p className="mt-1 text-xs leading-5 text-foreground-500">
              The audit log is the timeline for approvals, certificate changes, and integration events.
            </p>
          </div>
          <Link
            href="/admin/audit"
            className="text-xs font-medium text-foreground-600 transition-colors hover:text-primary-700"
          >
            View full audit log
          </Link>
        </div>
        <div className="divide-y divide-neutral-200/60">
          {recentActivity.map((entry) => (
            <div
              key={entry.id}
              className="grid gap-2 px-5 py-3 text-sm sm:grid-cols-[160px_1fr_auto] sm:items-center"
            >
              <span className="font-mono text-xs tabular-nums text-foreground-400">
                {entry.createdAt.toISOString().replace("T", " ").slice(0, 19)}
              </span>
              <span className="text-foreground-700 truncate">
                {getWebhookEvent(entry.eventType)?.label ?? entry.eventType}
              </span>
              {entry.actorName && (
                <span className="text-xs text-foreground-400 truncate">by {entry.actorName}</span>
              )}
            </div>
          ))}
          {recentActivity.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-foreground-400">
              No activity has been recorded yet. As actors register and certificates change, events
              will appear here.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
