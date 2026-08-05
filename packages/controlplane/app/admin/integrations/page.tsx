import Link from "next/link";
import { Plus, BookText } from "lucide-react";
import { WebhookDAO, NotificationChannelDAO } from "@/db";
import PageChrome from "@/components/layout/PageChrome";
import { secretPreview } from "@/lib/webhook-secret";
import { toggleWebhookActiveAction, deleteWebhookAction, toggleChannelActiveAction, deleteChannelAction } from "./actions";
import ServiceTypeBadges from "./channels/ServiceTypeBadges";

const TABS = [
  { id: "webhooks", label: "Webhooks" },
  { id: "channels", label: "Notification Channels" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function TabLink({ id, active, label }: { id: string; active: boolean; label: string }) {
  return (
    <Link
      href={`?tab=${id}`}
      className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active ? "border-primary-600 text-primary-700" : "border-transparent text-foreground-500 hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  );
}

/**
 * Integrations (docs/PAGE_DESIGN.md §1.8, docs/REBUILD_ARCHITECTURE.md §5) — Webhooks and
 * Notification Channels are the two slices built so far, both driven by the same event catalog
 * and the same `packages/webhook-dispatcher` worker (§5.1: "one event pipeline, not two"). OIDC/
 * Entra, API Keys, and Model Registry get their own tabs here once each is actually being built.
 */
export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: tabParam } = await searchParams;
  const activeTab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : "webhooks";

  const [webhooks, channels] = await Promise.all([WebhookDAO.list(), NotificationChannelDAO.list()]);

  return (
    <div className="p-6 space-y-4">
      <PageChrome
        toolbar={{
          title: "Integrations",
          description:
            activeTab === "webhooks"
              ? `${webhooks.length} webhook${webhooks.length === 1 ? "" : "s"} configured`
              : `${channels.length} channel${channels.length === 1 ? "" : "s"} configured`,
          actions: [
            activeTab === "webhooks"
              ? {
                  kind: "button",
                  id: "new-webhook",
                  label: "New webhook",
                  variant: "primary",
                  icon: <Plus className="w-3.5 h-3.5" />,
                  href: "/admin/integrations/webhooks/new",
                }
              : {
                  kind: "button",
                  id: "new-channel",
                  label: "New channel",
                  variant: "primary",
                  icon: <Plus className="w-3.5 h-3.5" />,
                  href: "/admin/integrations/channels/new",
                },
          ],
        }}
        breadcrumbs={[{ label: "Integrations" }]}
      />

      <div className="flex border-b border-neutral-200/60">
        {TABS.map((t) => (
          <TabLink key={t.id} id={t.id} active={activeTab === t.id} label={t.label} />
        ))}
      </div>

      {activeTab === "webhooks" ? (
        <WebhooksSection webhooks={webhooks} />
      ) : (
        <ChannelsSection channels={channels} />
      )}
    </div>
  );
}

function WebhooksSection({ webhooks }: { webhooks: Awaited<ReturnType<typeof WebhookDAO.list>> }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Link
          href="/admin/integrations/webhooks/docs"
          className="inline-flex items-center gap-1.5 text-xs text-primary-600 hover:underline"
        >
          <BookText className="w-3.5 h-3.5" />
          Docs & signature verification
        </Link>
      </div>

      <div className="overflow-x-auto border border-neutral-200/60 rounded-xl">
        <table className="w-full text-sm bg-background-100">
          <thead className="bg-background-200/40 text-left text-xs text-foreground-500 uppercase">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">URL</th>
              <th className="px-4 py-2 font-medium">Events</th>
              <th className="px-4 py-2 font-medium">Secret</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {webhooks.map((wh) => {
              const events = wh.events as string[];
              return (
                <tr key={wh.id} className="border-t border-neutral-200/60 align-top">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/admin/integrations/webhooks/${wh.id}`}
                      className="text-foreground font-medium hover:text-primary-600 hover:underline"
                    >
                      {wh.name}
                    </Link>
                    {wh.description && (
                      <div className="text-xs text-foreground-400 mt-0.5">{wh.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-foreground-500 font-mono text-xs max-w-xs truncate">
                    {wh.url}
                  </td>
                  <td className="px-4 py-2.5 text-foreground-500">
                    {events.length > 0 ? `${events.length} event${events.length === 1 ? "" : "s"}` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-foreground-500 font-mono text-xs">
                    {secretPreview(wh.secret)}
                  </td>
                  <td className="px-4 py-2.5">
                    <form action={toggleWebhookActiveAction}>
                      <input type="hidden" name="id" value={wh.id} />
                      <input type="hidden" name="isActive" value={(!wh.isActive).toString()} />
                      <button
                        type="submit"
                        className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                          wh.isActive
                            ? "bg-success-100 text-success-700 border-success-200 hover:bg-success-200/60"
                            : "bg-neutral-100 text-foreground-500 border-neutral-200 hover:bg-neutral-200/60"
                        }`}
                      >
                        ● {wh.isActive ? "Active" : "Disabled"}
                      </button>
                    </form>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/integrations/webhooks/${wh.id}`}
                        className="text-xs px-2 py-1 border border-neutral-200 rounded hover:bg-background-200/60 transition-colors"
                      >
                        Edit
                      </Link>
                      <form action={deleteWebhookAction}>
                        <input type="hidden" name="id" value={wh.id} />
                        <button
                          type="submit"
                          className="text-xs px-2 py-1 border border-danger-200 text-danger-600 rounded hover:bg-danger-50 transition-colors"
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
            {webhooks.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-foreground-400">
                  No webhooks configured yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-foreground-400">
        Signed HTTP POSTs to endpoints you control — VaultysClaw never knows or cares what&apos;s
        on the other end. See the docs link above for the envelope, headers, and how to verify the
        signature.
      </p>
    </div>
  );
}

function ChannelsSection({ channels }: { channels: Awaited<ReturnType<typeof NotificationChannelDAO.list>> }) {
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto border border-neutral-200/60 rounded-xl">
        <table className="w-full text-sm bg-background-100">
          <thead className="bg-background-200/40 text-left text-xs text-foreground-500 uppercase">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Apprise key</th>
              <th className="px-4 py-2 font-medium">Events</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {channels.map((ch) => {
              const events = ch.events as string[];
              const serviceTypes = ch.serviceTypes as string[];
              return (
                <tr key={ch.id} className="border-t border-neutral-200/60 align-top">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/admin/integrations/channels/${ch.id}`}
                      className="text-foreground font-medium hover:text-primary-600 hover:underline"
                    >
                      {ch.name}
                    </Link>
                    {ch.description && (
                      <div className="text-xs text-foreground-400 mt-0.5">{ch.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <ServiceTypeBadges types={serviceTypes} />
                  </td>
                  <td className="px-4 py-2.5 text-foreground-500 font-mono text-xs">{ch.appriseKey}</td>
                  <td className="px-4 py-2.5 text-foreground-500">
                    {events.length > 0 ? `${events.length} event${events.length === 1 ? "" : "s"}` : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <form action={toggleChannelActiveAction}>
                      <input type="hidden" name="id" value={ch.id} />
                      <input type="hidden" name="isActive" value={(!ch.isActive).toString()} />
                      <button
                        type="submit"
                        className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                          ch.isActive
                            ? "bg-success-100 text-success-700 border-success-200 hover:bg-success-200/60"
                            : "bg-neutral-100 text-foreground-500 border-neutral-200 hover:bg-neutral-200/60"
                        }`}
                      >
                        ● {ch.isActive ? "Active" : "Disabled"}
                      </button>
                    </form>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/integrations/channels/${ch.id}`}
                        className="text-xs px-2 py-1 border border-neutral-200 rounded hover:bg-background-200/60 transition-colors"
                      >
                        Edit
                      </Link>
                      <form action={deleteChannelAction}>
                        <input type="hidden" name="id" value={ch.id} />
                        <button
                          type="submit"
                          className="text-xs px-2 py-1 border border-danger-200 text-danger-600 rounded hover:bg-danger-50 transition-colors"
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
            {channels.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-foreground-400">
                  No notification channels configured yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-foreground-400">
        Human-facing alerts fanned out through a self-hosted Apprise API container — VaultysClaw
        renders a title and body and asks Apprise to deliver it; Apprise owns the actual email/
        Slack/PagerDuty/ntfy/etc. integration.
      </p>
    </div>
  );
}
