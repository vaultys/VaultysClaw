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
  X,
} from "lucide-react";
import {
  ActorDAO,
  PendingRegistrationDAO,
  CapabilityCertificateDAO,
  AuditLogDAO,
  SettingsDAO,
} from "@/db";
import { getWebhookEvent } from "@vaultysclaw/shared";
import PageChrome from "@/components/layout/PageChrome";
import TiltCard from "@/components/ui/TiltCard";
import FloatingOrbs from "@/components/ui/FloatingOrbs";
import ProgressRing3D from "@/components/ui/ProgressRing3D";
import { SETTINGS_KEYS } from "@/lib/org-settings";
import { dismissOnboardingSetupAction } from "./actions";

/**
 * Overview (docs/PAGE_DESIGN.md §1.2) — posture summary, guided setup, and
 * links into the source-of-truth pages where operators take action.
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
  const completedSteps = [
    totalActors > 1,
    pending.length === 0 && awaitingDelivery.length === 0,
    activeCerts > 0,
    recentActivity.length > 0,
  ].filter(Boolean).length;
  const setupComplete = completedSteps === 4;
  const showOnboardingSetup = !setupComplete || onboardingDismissed !== "1";

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
    <div className="relative p-6 space-y-6">
      <FloatingOrbs className="-z-10" count={5} />
      <PageChrome
        toolbar={{
          title: "Overview",
          description: "Trust posture, onboarding progress, and the next useful action.",
        }}
        breadcrumbs={[{ label: "Overview" }]}
      />

      {showOnboardingSetup && (
        <section className="relative overflow-hidden rounded-2xl border border-neutral-200/60 bg-background-100">
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
                <ProgressRing3D
                  progress={(completedSteps / setupSteps.length) * 100}
                  size={80}
                  strokeWidth={6}
                  progressColor="rgb(var(--primary-600))"
                  trackColor="rgb(var(--neutral-200) / 0.5)"
                />
              </div>
              <p className="mt-3 text-xs leading-5 text-foreground-500">
                A completed step means the system has real data for that part of the operating loop.
                You can still revisit each area at any time.
              </p>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {tiles.map((tile) => (
          <TiltCard
            key={tile.label}
            className={`group rounded-xl border ${toneClasses[tile.tone].border} ${toneClasses[tile.tone].bg}`}
            maxTilt={6}
            scale={1.01}
            perspective={1000}
            speed={200}
          >
            <Link
              href={tile.href}
              className="block p-5 transition-colors hover:border-primary-300"
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
          </TiltCard>
        ))}
      </div>

      <div className={`grid gap-6 ${showOnboardingSetup ? "xl:grid-cols-[1fr_360px]" : "xl:grid-cols-2"}`}>
        {showOnboardingSetup && (
          <section className="relative rounded-2xl border border-neutral-200/60 bg-background-100 transition-all hover:shadow-xl">
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
                  className="group flex gap-4 px-5 py-4 transition-all duration-200 hover:bg-background-200/40 hover:-translate-x-1 hover:shadow-md"
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
        )}

        <aside className="space-y-4">
          <TiltCard
            className="rounded-xl border border-neutral-200/60 bg-background-100 p-5"
            maxTilt={4}
            scale={1.01}
            perspective={800}
            speed={150}
          >
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
                  className={`block rounded-lg border px-3 py-3 transition-all duration-200 hover:border-primary-300 hover:-translate-y-0.5 hover:shadow-md ${
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
          </TiltCard>

          <TiltCard
            className="rounded-xl border border-neutral-200/60 bg-background-100 p-5"
            maxTilt={4}
            scale={1.01}
            perspective={800}
            speed={150}
          >
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
                  className="rounded-full border border-neutral-200 bg-background px-3 py-1 text-sm text-foreground-700 transition-all hover:scale-105 hover:shadow-sm"
                >
                  {kind}: {count}
                </span>
              ))}
            </div>
          </TiltCard>
        </aside>
      </div>

      <section className="relative rounded-2xl border border-neutral-200/60 bg-background-100 transition-all hover:shadow-xl">
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
              className="grid gap-2 px-5 py-3 text-sm sm:grid-cols-[150px_1fr_auto] sm:items-center transition-all duration-200 hover:bg-background-200/40 hover:-translate-x-1"
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
