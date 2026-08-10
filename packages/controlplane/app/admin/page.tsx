import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock3,
  KeyRound,
  Plug,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import { ActorDAO, PendingRegistrationDAO, CapabilityCertificateDAO, AuditLogDAO } from "@/db";
import { getWebhookEvent } from "@vaultysclaw/shared";
import PageChrome from "@/components/layout/PageChrome";

/**
 * Overview (docs/PAGE_DESIGN.md §1.2) — posture summary, guided setup, and
 * links into the source-of-truth pages where operators take action.
 */
export default async function AdminOverviewPage() {
  const [byKind, pending, awaitingDelivery, activeCerts, recentActivity] = await Promise.all([
    ActorDAO.countByKind(),
    PendingRegistrationDAO.listPending(),
    PendingRegistrationDAO.listApprovedUndelivered(),
    CapabilityCertificateDAO.countActive(),
    AuditLogDAO.recent(20),
  ]);

  const totalActors = Object.values(byKind).reduce((a, b) => a + b, 0);
  const humanActors = byKind.human ?? 0;
  const sensorActors = byKind.sensor ?? 0;
  const automatedActors = totalActors - humanActors - sensorActors;
  const completedSteps = [
    totalActors > 1,
    pending.length === 0 && awaitingDelivery.length === 0,
    activeCerts > 0,
    recentActivity.length > 0,
  ].filter(Boolean).length;

  const tiles = [
    {
      label: "Actors",
      value: totalActors,
      detail: `${humanActors} human · ${automatedActors} agent/device · ${sensorActors} sensor`,
      href: "/admin/actors",
      tone: "primary" as const,
      icon: Users,
    },
    {
      label: "Pending approval",
      value: pending.length + awaitingDelivery.length,
      detail:
        pending.length > 0
          ? "Registration decisions need attention"
          : awaitingDelivery.length > 0
            ? "Approved grants are waiting for reconnect"
            : "Registration queue is clear",
      href: "/admin/actors",
      tone: pending.length + awaitingDelivery.length > 0 ? "warning" as const : "neutral" as const,
      icon: Clock3,
    },
    {
      label: "Active certificates",
      value: activeCerts,
      detail:
        activeCerts > 0
          ? "Capability grants currently usable"
          : "Issue a grant to make access explicit",
      href: "/admin/certificates",
      tone: activeCerts > 0 ? "success" as const : "neutral" as const,
      icon: KeyRound,
    },
  ];

  const toneClasses: Record<string, { text: string; bg: string; border: string; ring: string }> = {
    primary: {
      text: "text-primary-700",
      bg: "bg-primary-50",
      border: "border-primary-200",
      ring: "bg-primary-600",
    },
    warning: {
      text: "text-warning-700",
      bg: "bg-warning-50",
      border: "border-warning-200",
      ring: "bg-warning-500",
    },
    success: {
      text: "text-success-700",
      bg: "bg-success-50",
      border: "border-success-200",
      ring: "bg-success-600",
    },
    neutral: {
      text: "text-foreground",
      bg: "bg-background-100",
      border: "border-neutral-200",
      ring: "bg-neutral-400",
    },
  };

  const setupSteps = [
    {
      title: "Invite operators",
      description:
        "Add the people who will approve actors, inspect audit trails, and manage certificate grants.",
      done: totalActors > 1,
      href: "/admin/actors/invite",
      action: "Invite a human",
      icon: UserPlus,
    },
    {
      title: "Approve new actors",
      description:
        "Review requested capabilities before an agent, device, or server becomes part of the trust graph.",
      done: pending.length === 0 && awaitingDelivery.length === 0,
      href: "/admin/actors",
      action: pending.length > 0 ? "Review pending actors" : "Open actors",
      icon: ShieldCheck,
    },
    {
      title: "Grant least privilege",
      description: "Certificates define what an actor may do, for which scope, and for how long.",
      done: activeCerts > 0,
      href: "/admin/certificates/new",
      action: "Issue a certificate",
      icon: KeyRound,
    },
    {
      title: "Wire notifications",
      description:
        "Send signed events to webhooks or notification channels so important changes do not stay hidden.",
      done: recentActivity.length > 0,
      href: "/admin/integrations",
      action: "Configure integrations",
      icon: Plug,
    },
  ];

  const attentionItems = [
    pending.length > 0
      ? {
          title: `${pending.length} actor${pending.length === 1 ? "" : "s"} awaiting approval`,
          description: "Approve only the capabilities each actor needs right now.",
          href: "/admin/actors",
          tone: "warning" as const,
        }
      : null,
    awaitingDelivery.length > 0
      ? {
          title: `${awaitingDelivery.length} grant${awaitingDelivery.length === 1 ? "" : "s"} awaiting delivery`,
          description: "These certificates will be delivered when the actor reconnects.",
          href: "/admin/actors",
          tone: "warning" as const,
        }
      : null,
    activeCerts === 0
      ? {
          title: "No active certificates yet",
          description:
            "Actors can register before they are trusted. Issue a certificate to grant access.",
          href: "/admin/certificates/new",
          tone: "primary" as const,
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <div className="p-6 space-y-6">
      <PageChrome
        toolbar={{
          title: "Overview",
          description: "Trust posture, onboarding progress, and the next useful action.",
        }}
        breadcrumbs={[{ label: "Overview" }]}
      />

      <section className="overflow-hidden rounded-xl border border-neutral-200/60 bg-background-100">
        <div className="grid gap-0 lg:grid-cols-[1.4fr_0.9fr]">
          <div className="p-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">
              <Sparkles className="h-3.5 w-3.5" />
              Guided setup
            </div>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
              Build a verifiable operating perimeter
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-foreground-600">
              VaultysClaw starts with identities, then turns explicit approvals into capability
              certificates. This overview keeps the first-run path visible and turns live system
              state into the next thing an operator should do.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href={pending.length > 0 ? "/admin/actors" : "/admin/actors/invite"}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-500"
              >
                {pending.length > 0 ? "Review approvals" : "Start onboarding"}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/admin/certificates"
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-background px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background-200/60"
              >
                View certificate ledger
              </Link>
            </div>
          </div>
          <div className="border-t border-neutral-200/60 bg-background-200/30 p-6 lg:border-l lg:border-t-0">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-foreground-500">
                  Setup progress
                </p>
                <p className="mt-1 text-3xl font-semibold text-foreground">{completedSteps}/4</p>
              </div>
              <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-neutral-200 bg-background-100">
                <ShieldCheck className="h-7 w-7 text-primary-600" />
              </div>
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-background-300">
              <div
                className="h-full rounded-full bg-primary-600 transition-all"
                style={{ width: `${(completedSteps / setupSteps.length) * 100}%` }}
              />
            </div>
            <p className="mt-3 text-xs leading-5 text-foreground-500">
              A completed step means the system has real data for that part of the operating loop.
              You can still revisit each area at any time.
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        {tiles.map((tile) => (
          <Link
            key={tile.label}
            href={tile.href}
            className={`group rounded-xl border ${toneClasses[tile.tone].border} ${toneClasses[tile.tone].bg} p-5 transition-colors hover:border-primary-300`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className={`text-3xl font-semibold ${toneClasses[tile.tone].text}`}>
                  {tile.value}
                </div>
                <div className="mt-1 text-sm font-medium text-foreground">{tile.label}</div>
              </div>
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${toneClasses[tile.tone].ring} text-white`}
              >
                <tile.icon className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-3 text-xs leading-5 text-foreground-500">{tile.detail}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <section className="rounded-xl border border-neutral-200/60 bg-background-100">
          <div className="border-b border-neutral-200/60 px-5 py-4">
            <h2 className="text-sm font-semibold text-foreground-800">Onboarding checklist</h2>
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
                    <CheckCircle2 className="h-5 w-5 text-success-600" />
                  ) : (
                    <Circle className="h-5 w-5 text-foreground-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <step.icon className="h-4 w-4 text-foreground-500" />
                    <h3 className="text-sm font-semibold text-foreground">
                      {index + 1}. {step.title}
                    </h3>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-foreground-500">{step.description}</p>
                </div>
                <div className="hidden items-center gap-1 text-xs font-medium text-primary-600 group-hover:underline sm:flex">
                  {step.action}
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </Link>
            ))}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-xl border border-neutral-200/60 bg-background-100 p-5">
            <h2 className="text-sm font-semibold text-foreground-800">Needs attention</h2>
            <p className="mt-1 text-xs leading-5 text-foreground-500">
              Items here are safe to handle from their source page; the overview only points.
            </p>
            <div className="mt-4 space-y-3">
              {attentionItems.length === 0 && (
                <div className="rounded-lg border border-success-200 bg-success-50 px-3 py-3 text-sm text-success-700">
                  No urgent setup items. Your control plane is ready for regular monitoring.
                </div>
              )}
              {attentionItems.map((item) => (
                <Link
                  key={item.title}
                  href={item.href}
                  className={`block rounded-lg border px-3 py-3 transition-colors hover:border-primary-300 ${
                    item.tone === "warning"
                      ? "border-warning-200 bg-warning-50"
                      : "border-primary-200 bg-primary-50"
                  }`}
                >
                  <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-1 text-xs leading-5 text-foreground-600">{item.description}</p>
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-neutral-200/60 bg-background-100 p-5">
            <h2 className="text-sm font-semibold text-foreground-800">Actor mix</h2>
            <p className="mt-1 text-xs leading-5 text-foreground-500">
              A healthy deployment usually has humans for oversight, sensors for observation, and
              agents or devices with narrow certificates.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {Object.entries(byKind).length === 0 && (
                <p className="text-sm text-foreground-400">No actors registered yet.</p>
              )}
              {Object.entries(byKind).map(([kind, count]) => (
                <span
                  key={kind}
                  className="rounded-full border border-neutral-200 bg-background px-3 py-1 text-sm text-foreground-700"
                >
                  {kind}: {count}
                </span>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <section className="rounded-xl border border-neutral-200/60 bg-background-100">
        <div className="flex items-center justify-between border-b border-neutral-200/60 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground-800">Recent activity</h2>
            <p className="mt-1 text-xs leading-5 text-foreground-500">
              The audit log is the timeline for approvals, certificate changes, and integration events.
            </p>
          </div>
          <Link href="/admin/audit" className="text-xs font-medium text-primary-600 hover:underline">
            View full audit log
          </Link>
        </div>
        <div className="divide-y divide-neutral-200/60">
          {recentActivity.map((entry) => (
            <div
              key={entry.id}
              className="grid gap-2 px-5 py-3 text-sm sm:grid-cols-[150px_1fr_auto] sm:items-center"
            >
              <span className="text-xs text-foreground-400">
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
