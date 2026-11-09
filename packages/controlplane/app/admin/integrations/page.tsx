import Link from "next/link";
import { Plus, BookText } from "lucide-react";
import { WebhookDAO, NotificationChannelDAO, ModelDAO, SsoConnectionDAO, CustomCapabilityDAO } from "@/db";
import PageChrome from "@/components/layout/PageChrome";
import { Badge } from "@/components/ui/Badge";
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
  { id: "channels", label: "Notification channels" },
  { id: "models", label: "Models" },
  { id: "identity", label: "Identity" },
  { id: "capabilities", label: "Capabilities" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function TabLink({ id, active, label }: { id: string; active: boolean; label: string }) {
  return (
    <Link
      href={`?tab=${id}`}
      className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active ? "border-primary-600 text-foreground" : "border-transparent text-foreground-500 hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  );
}

/** An inline enable/disable toggle that reads as state: a hairline button carrying the same dot a
 *  `<Badge>` would, still a submit button for the row's toggle form. */
function StateToggle({ active, activeLabel }: { active: boolean; activeLabel: string }) {
  return (
    <button
      type="submit"
      title={active ? "Click to disable" : "Click to enable"}
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-neutral-200 bg-background-100 px-2 py-1 text-xs text-foreground-700 transition-colors hover:bg-background-200"
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${active ? "bg-success-600" : "bg-neutral-400"}`} />
      {active ? activeLabel : "Disabled"}
    </button>
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
  capabilities: {
    count: (c) => `${c.capabilities} custom capabilit${c.capabilities === 1 ? "y" : "ies"} registered`,
    newLabel: "Add capability",
    newHref: "/admin/integrations/capabilities/new",
    newId: "new-capability",
  },
};

interface Counts {
  webhooks: number;
  channels: number;
  models: number;
  identity: number;
  capabilities: number;
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

  const [webhooks, channels, models, connections, capabilities] = await Promise.all([
    WebhookDAO.list(),
    NotificationChannelDAO.list(),
    ModelDAO.list(),
    SsoConnectionDAO.list(),
    CustomCapabilityDAO.list(),
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
            capabilities: capabilities.length,
          }),
          actions: [
            {
              kind: "button",
              id: chrome.newId,
              label: chrome.newLabel,
              variant: "primary",
              icon: <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />,
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
      {activeTab === "capabilities" && <CapabilitiesSection capabilities={capabilities} />}
    </div>
  );
}

/**
 * The custom-capability registry (docs/CUSTOM_CAPABILITIES.md).
 *
 * Read-only here: a row makes a name grantable *and* resolvable, and deleting one revokes every
 * grant of it, so both edit and delete live behind the detail page where the affected-grant count
 * is shown. No inline toggle for the same reason — there is no "disabled but still resolving"
 * state to toggle into, by design.
 */
function CapabilitiesSection({
  capabilities,
}: {
  capabilities: Awaited<ReturnType<typeof CustomCapabilityDAO.list>>;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-neutral-200/60 bg-background-100 px-4 py-3 text-sm text-foreground-600">
        Admin-defined <code>vendor:action</code> capabilities. They travel through the same
        certificates, scoping and revocation as built-in ones &mdash; the control plane governs who
        may hold each name, and the application that binds an operation to it decides what it does.
        A name deleted here stops resolving on every holder&rsquo;s next status check.
      </div>

      {capabilities.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-200 px-4 py-6 text-sm text-foreground-500">
          No custom capabilities yet. Built-in capabilities are always available &mdash; add one here
          only when an application needs to gate something the built-ins don&rsquo;t describe.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200/60">
          <table className="w-full text-sm bg-background-100">
            <thead className="border-b border-neutral-200/60 text-left text-xs text-foreground-500">
              <tr>
                <th className="px-4 py-2 font-normal">Name</th>
                <th className="px-4 py-2 font-normal">Label</th>
                <th className="px-4 py-2 font-normal">Vendor</th>
                <th className="px-4 py-2 font-normal">Group</th>
              </tr>
            </thead>
            <tbody>
              {capabilities.map((cap) => (
                <tr key={cap.id} className="border-t border-neutral-200/60 align-top transition-colors hover:bg-background-200/40">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/admin/integrations/capabilities/${cap.id}`}
                      className="font-mono text-xs text-foreground hover:text-primary-700 hover:underline"
                    >
                      {cap.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-foreground">
                    {cap.label}
                    {cap.description && (
                      <div className="mt-0.5 text-xs text-foreground-500">{cap.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-foreground-500">{cap.vendor}</td>
                  <td className="px-4 py-2.5 text-foreground-500">{cap.group ?? "\u2014"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
          className="inline-flex items-center gap-1.5 text-xs text-primary-700 hover:underline"
        >
          <BookText className="h-3.5 w-3.5" strokeWidth={1.5} />
          Docs & signature verification
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200/60">
        <table className="w-full text-sm bg-background-100">
          <thead className="border-b border-neutral-200/60 text-left text-xs text-foreground-500">
            <tr>
              <th className="px-4 py-2 font-normal">Name</th>
              <th className="px-4 py-2 font-normal">URL</th>
              <th className="px-4 py-2 font-normal">Events</th>
              <th className="px-4 py-2 font-normal">Secret</th>
              <th className="px-4 py-2 font-normal">Status</th>
              <th className="px-4 py-2 font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {webhooks.map((wh) => {
              const events = wh.events as string[];
              return (
                <tr key={wh.id} className="border-t border-neutral-200/60 align-top transition-colors hover:bg-background-200/40">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/admin/integrations/webhooks/${wh.id}`}
                      className="text-foreground font-medium hover:text-primary-700 hover:underline"
                    >
                      {wh.name}
                    </Link>
                    {wh.description && (
                      <div className="mt-0.5 text-xs text-foreground-500">{wh.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-foreground-500 font-mono text-xs max-w-xs truncate">
                    {wh.url}
                  </td>
                  <td className="px-4 py-2.5 text-foreground-500 tabular-nums">
                    {events.length > 0 ? `${events.length} event${events.length === 1 ? "" : "s"}` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-foreground-500 font-mono text-xs">
                    {secretPreview(wh.secret)}
                  </td>
                  <td className="px-4 py-2.5">
                    <form action={toggleWebhookActiveAction}>
                      <input type="hidden" name="id" value={wh.id} />
                      <input type="hidden" name="isActive" value={(!wh.isActive).toString()} />
                      <StateToggle active={wh.isActive} activeLabel="Active" />
                    </form>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/integrations/webhooks/${wh.id}`}
                        className="rounded-lg border border-neutral-200 bg-background-100 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-background-200"
                      >
                        Edit
                      </Link>
                      <form action={deleteWebhookAction}>
                        <input type="hidden" name="id" value={wh.id} />
                        <button
                          type="submit"
                          className="rounded-lg border border-neutral-200 bg-background-100 px-2.5 py-1 text-xs font-medium text-danger-700 transition-colors hover:bg-background-200"
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
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-foreground-500">
                  No webhooks configured yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs leading-5 text-foreground-500">
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

      <div className="overflow-x-auto rounded-xl border border-neutral-200/60">
        <table className="w-full text-sm bg-background-100">
          <thead className="border-b border-neutral-200/60 text-left text-xs text-foreground-500">
            <tr>
              <th className="px-4 py-2 font-normal">Name</th>
              <th className="px-4 py-2 font-normal">Type</th>
              <th className="px-4 py-2 font-normal">Delivery key</th>
              <th className="px-4 py-2 font-normal">Events</th>
              <th className="px-4 py-2 font-normal">Status</th>
              <th className="px-4 py-2 font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {channels.map((ch) => {
              const events = ch.events as string[];
              const serviceTypes = ch.serviceTypes as string[];
              return (
                <tr key={ch.id} className="border-t border-neutral-200/60 align-top transition-colors hover:bg-background-200/40">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/admin/integrations/channels/${ch.id}`}
                      className="text-foreground font-medium hover:text-primary-700 hover:underline"
                    >
                      {ch.name}
                    </Link>
                    {ch.description && (
                      <div className="mt-0.5 text-xs text-foreground-500">{ch.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <ServiceTypeBadges types={serviceTypes} />
                  </td>
                  <td className="px-4 py-2.5 text-foreground-500 font-mono text-xs">{ch.appriseKey}</td>
                  <td className="px-4 py-2.5 text-foreground-500 tabular-nums">
                    {events.length > 0 ? `${events.length} event${events.length === 1 ? "" : "s"}` : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <form action={toggleChannelActiveAction}>
                      <input type="hidden" name="id" value={ch.id} />
                      <input type="hidden" name="isActive" value={(!ch.isActive).toString()} />
                      <StateToggle active={ch.isActive} activeLabel="Active" />
                    </form>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/integrations/channels/${ch.id}`}
                        className="rounded-lg border border-neutral-200 bg-background-100 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-background-200"
                      >
                        Edit
                      </Link>
                      <form action={deleteChannelAction}>
                        <input type="hidden" name="id" value={ch.id} />
                        <button
                          type="submit"
                          className="rounded-lg border border-neutral-200 bg-background-100 px-2.5 py-1 text-xs font-medium text-danger-700 transition-colors hover:bg-background-200"
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
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-foreground-500">
                  No notification channels configured yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs leading-5 text-foreground-500">
        Human-facing alerts delivered to email, chat, paging, webhook, and push services.
      </p>
    </div>
  );
}

function ModelsSection({ models }: { models: Awaited<ReturnType<typeof ModelDAO.list>> }) {
  return (
    <div className="space-y-4">
      <LiteLLMPanel />

      <div className="overflow-x-auto rounded-xl border border-neutral-200/60">
        <table className="w-full text-sm bg-background-100">
          <thead className="border-b border-neutral-200/60 text-left text-xs text-foreground-500">
            <tr>
              <th className="px-4 py-2 font-normal">Name</th>
              <th className="px-4 py-2 font-normal">Provider</th>
              <th className="px-4 py-2 font-normal">Model ID</th>
              <th className="px-4 py-2 font-normal">Workspaces</th>
              <th className="px-4 py-2 font-normal">Key</th>
              <th className="px-4 py-2 font-normal">Status</th>
              <th className="px-4 py-2 font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.id} className="border-t border-neutral-200/60 align-top transition-colors hover:bg-background-200/40">
                <td className="px-4 py-2.5">
                  <Link
                    href={`/admin/integrations/models/${m.id}`}
                    className="text-foreground font-medium hover:text-primary-700 hover:underline"
                  >
                    {m.name}
                  </Link>
                  {m.description && (
                    <div className="mt-0.5 text-xs text-foreground-500">{m.description}</div>
                  )}
                </td>
                <td className="px-4 py-2.5 text-foreground-500">
                  {isKnownProvider(m.provider) ? PROVIDERS[m.provider].label : m.provider}
                </td>
                <td className="px-4 py-2.5 text-foreground-500 font-mono text-xs">{m.modelId}</td>
                <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-foreground-500">
                  {m.workspaceAccess.length > 0 ? m.workspaceAccess.length : "—"}
                </td>
                <td className="px-4 py-2.5 text-foreground-500 text-xs">
                  {m.hasApiKey ? "Set" : "—"}
                </td>
                <td className="px-4 py-2.5">
                  <form action={toggleModelActiveAction}>
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="isActive" value={(!m.isActive).toString()} />
                    <StateToggle active={m.isActive} activeLabel="Active" />
                  </form>
                </td>
                <td className="px-4 py-2.5">
                  <Link
                    href={`/admin/integrations/models/${m.id}`}
                    className="rounded-lg border border-neutral-200 bg-background-100 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-background-200"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {models.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-foreground-500">
                  No models registered yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs leading-5 text-foreground-500">
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
      <div className="overflow-x-auto rounded-xl border border-neutral-200/60">
        <table className="w-full text-sm bg-background-100">
          <thead className="border-b border-neutral-200/60 text-left text-xs text-foreground-500">
            <tr>
              <th className="px-4 py-2 font-normal">Name</th>
              <th className="px-4 py-2 font-normal">Type</th>
              <th className="px-4 py-2 font-normal">Issuer</th>
              <th className="px-4 py-2 font-normal">Client ID</th>
              <th className="px-4 py-2 font-normal">Status</th>
              <th className="px-4 py-2 font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {connections.map((c) => (
              <tr key={c.id} className="border-t border-neutral-200/60 align-top transition-colors hover:bg-background-200/40">
                <td className="px-4 py-2.5">
                  <Link
                    href={`/admin/integrations/identity/${c.id}`}
                    className="text-foreground font-medium hover:text-primary-700 hover:underline"
                  >
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-2.5">
                  <Badge>{c.kind === "entra" ? "Entra ID" : "OIDC"}</Badge>
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
                    <StateToggle active={c.isActive} activeLabel="Enabled" />
                  </form>
                </td>
                <td className="px-4 py-2.5">
                  <Link
                    href={`/admin/integrations/identity/${c.id}`}
                    className="rounded-lg border border-neutral-200 bg-background-100 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-background-200"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {connections.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-foreground-500">
                  No identity providers configured — humans sign in with a VaultysId only.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs leading-5 text-foreground-500">
        OIDC and Microsoft Entra ID establish who a human is; they never grant access on
        their own. A person signing in for the first time is asked to bind a VaultysId, and from
        then on every permission they hold comes from the certificate ledger like anyone
        else&apos;s — a freshly bound human gets Access Portal only until an admin issues more.
      </p>
    </div>
  );
}
