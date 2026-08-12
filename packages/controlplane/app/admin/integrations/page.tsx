import Link from "next/link";
import { Plus, BookText } from "lucide-react";
import { WebhookDAO, NotificationChannelDAO, ModelDAO, SsoConnectionDAO } from "@/db";
import PageChrome from "@/components/layout/PageChrome";
import { secretPreview } from "@/lib/webhook-secret";
import { isKnownProvider, PROVIDERS } from "@/lib/model-providers";
import {
  toggleWebhookActiveAction,
  deleteWebhookAction,
  toggleChannelActiveAction,
  deleteChannelAction,
  toggleModelActiveAction,
} from "./actions";
import { toggleSsoConnectionAction } from "./identity/actions";
import ServiceTypeBadges from "./channels/ServiceTypeBadges";
import HealthPanel from "./channels/HealthPanel";
import LiteLLMPanel from "./models/LiteLLMPanel";

const TABS = [
  { id: "webhooks", label: "Webhooks" },
  { id: "channels", label: "Notification Channels" },
  { id: "models", label: "Models" },
  { id: "identity", label: "Identity" },
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

/** Per-tab toolbar copy + primary action, kept as data so the page body doesn't grow a
 *  three-way ternary per field every time a tab is added. */
const TAB_CHROME: Record<
  TabId,
  { count: (c: Counts) => string; newLabel: string; newHref: string; newId: string }
> = {
  webhooks: {
    count: (c) => `${c.webhooks} webhook${c.webhooks === 1 ? "" : "s"} configured`,
    newLabel: "New webhook",
    newHref: "/admin/integrations/webhooks/new",
    newId: "new-webhook",
  },
  channels: {
    count: (c) => `${c.channels} channel${c.channels === 1 ? "" : "s"} configured`,
    newLabel: "New channel",
    newHref: "/admin/integrations/channels/new",
    newId: "new-channel",
  },
  models: {
    count: (c) => `${c.models} model${c.models === 1 ? "" : "s"} registered`,
    newLabel: "Register model",
    newHref: "/admin/integrations/models/new",
    newId: "new-model",
  },
  identity: {
    count: (c) => `${c.identity} identity provider${c.identity === 1 ? "" : "s"} configured`,
    newLabel: "Add provider",
    newHref: "/admin/integrations/identity/new",
    newId: "new-sso",
  },
};

interface Counts {
  webhooks: number;
  channels: number;
  models: number;
  identity: number;
}

/**
 * Integrations (docs/PAGE_DESIGN.md §1.8, docs/REBUILD_ARCHITECTURE.md §5) — Webhooks and
 * Notification Channels share one event catalog and one `packages/webhook-dispatcher` worker
 * (§5.1: "one event pipeline, not two"); Models is the LLM provider registry, whose only external
 * dependency is the optional LiteLLM proxy. Identity (OIDC/Entra) and API Keys get their own tabs
 * here once each is actually being built.
 */
export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: tabParam } = await searchParams;
  const activeTab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : "webhooks";

  const [webhooks, channels, models, connections] = await Promise.all([
    WebhookDAO.list(),
    NotificationChannelDAO.list(),
    ModelDAO.list(),
    SsoConnectionDAO.list(),
  ]);
  const chrome = TAB_CHROME[activeTab];

  return (
    <div className="p-6 space-y-4">
      <PageChrome
        toolbar={{
          title: "Integrations",
          description: chrome.count({
            webhooks: webhooks.length,
            channels: channels.length,
            models: models.length,
            identity: connections.length,
          }),
          actions: [
            {
              kind: "button",
              id: chrome.newId,
              label: chrome.newLabel,
              variant: "primary",
              icon: <Plus className="w-3.5 h-3.5" />,
              href: chrome.newHref,
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

      {activeTab === "webhooks" && <WebhooksSection webhooks={webhooks} />}
      {activeTab === "channels" && <ChannelsSection channels={channels} />}
      {activeTab === "models" && <ModelsSection models={models} />}
      {activeTab === "identity" && <IdentitySection connections={connections} />}
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
      <HealthPanel />

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

function ModelsSection({ models }: { models: Awaited<ReturnType<typeof ModelDAO.list>> }) {
  return (
    <div className="space-y-4">
      <LiteLLMPanel />

      <div className="overflow-x-auto border border-neutral-200/60 rounded-xl">
        <table className="w-full text-sm bg-background-100">
          <thead className="bg-background-200/40 text-left text-xs text-foreground-500 uppercase">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Provider</th>
              <th className="px-4 py-2 font-medium">Model ID</th>
              <th className="px-4 py-2 font-medium">Workspaces</th>
              <th className="px-4 py-2 font-medium">Key</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.id} className="border-t border-neutral-200/60 align-top">
                <td className="px-4 py-2.5">
                  <Link
                    href={`/admin/integrations/models/${m.id}`}
                    className="text-foreground font-medium hover:text-primary-600 hover:underline"
                  >
                    {m.name}
                  </Link>
                  {m.description && (
                    <div className="text-xs text-foreground-400 mt-0.5">{m.description}</div>
                  )}
                </td>
                <td className="px-4 py-2.5 text-foreground-500">
                  {isKnownProvider(m.provider) ? PROVIDERS[m.provider].label : m.provider}
                </td>
                <td className="px-4 py-2.5 text-foreground-500 font-mono text-xs">{m.modelId}</td>
                <td className="px-4 py-2.5 text-foreground-500">
                  {m.workspaceAccess.length > 0 ? m.workspaceAccess.length : "—"}
                </td>
                <td className="px-4 py-2.5 text-foreground-500 text-xs">
                  {m.hasApiKey ? "Set" : "—"}
                </td>
                <td className="px-4 py-2.5">
                  <form action={toggleModelActiveAction}>
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="isActive" value={(!m.isActive).toString()} />
                    <button
                      type="submit"
                      className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                        m.isActive
                          ? "bg-success-100 text-success-700 border-success-200 hover:bg-success-200/60"
                          : "bg-neutral-100 text-foreground-500 border-neutral-200 hover:bg-neutral-200/60"
                      }`}
                    >
                      ● {m.isActive ? "Active" : "Disabled"}
                    </button>
                  </form>
                </td>
                <td className="px-4 py-2.5">
                  <Link
                    href={`/admin/integrations/models/${m.id}`}
                    className="text-xs px-2 py-1 border border-neutral-200 rounded hover:bg-background-200/60 transition-colors"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {models.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-foreground-400">
                  No models registered yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-foreground-400">
        The org&apos;s catalogue of LLM endpoints and which workspaces may use each one. Provider
        keys are encrypted at rest and never redisplayed. Deleting a model here also deregisters it
        from the LiteLLM proxy, when one is connected.
      </p>
    </div>
  );
}

function IdentitySection({
  connections,
}: {
  connections: Awaited<ReturnType<typeof SsoConnectionDAO.list>>;
}) {
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto border border-neutral-200/60 rounded-xl">
        <table className="w-full text-sm bg-background-100">
          <thead className="bg-background-200/40 text-left text-xs text-foreground-500 uppercase">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Issuer</th>
              <th className="px-4 py-2 font-medium">Client ID</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {connections.map((c) => (
              <tr key={c.id} className="border-t border-neutral-200/60 align-top">
                <td className="px-4 py-2.5">
                  <Link
                    href={`/admin/integrations/identity/${c.id}`}
                    className="text-foreground font-medium hover:text-primary-600 hover:underline"
                  >
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full border ${
                      c.kind === "entra"
                        ? "bg-primary-100 text-primary-700 border-primary-200"
                        : "bg-neutral-100 text-foreground-600 border-neutral-200"
                    }`}
                  >
                    {c.kind === "entra" ? "Entra ID" : "OIDC"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-foreground-500 font-mono text-xs max-w-xs truncate">
                  {c.issuer}
                </td>
                <td className="px-4 py-2.5 text-foreground-500 font-mono text-xs max-w-[12rem] truncate">
                  {c.clientId}
                </td>
                <td className="px-4 py-2.5">
                  <form action={toggleSsoConnectionAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="isActive" value={(!c.isActive).toString()} />
                    <button
                      type="submit"
                      className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                        c.isActive
                          ? "bg-success-100 text-success-700 border-success-200 hover:bg-success-200/60"
                          : "bg-neutral-100 text-foreground-500 border-neutral-200 hover:bg-neutral-200/60"
                      }`}
                    >
                      ● {c.isActive ? "Enabled" : "Disabled"}
                    </button>
                  </form>
                </td>
                <td className="px-4 py-2.5">
                  <Link
                    href={`/admin/integrations/identity/${c.id}`}
                    className="text-xs px-2 py-1 border border-neutral-200 rounded hover:bg-background-200/60 transition-colors"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {connections.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-foreground-400">
                  No identity providers configured — humans sign in with a VaultysId only.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-foreground-400">
        OIDC and Microsoft Entra ID establish <em>who</em> a human is; they never grant access on
        their own. A person signing in for the first time is asked to bind a VaultysId, and from
        then on every permission they hold comes from the certificate ledger like anyone
        else&apos;s — a freshly bound human gets Access Portal only until an admin issues more.
      </p>
    </div>
  );
}
