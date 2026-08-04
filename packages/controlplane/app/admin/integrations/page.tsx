import Link from "next/link";
import { Plus, BookText } from "lucide-react";
import { WebhookDAO } from "@/db";
import PageChrome from "@/components/layout/PageChrome";
import { secretPreview } from "@/lib/webhook-secret";
import { toggleWebhookActiveAction, deleteWebhookAction } from "./actions";

/**
 * Integrations (docs/PAGE_DESIGN.md §1.8, docs/REBUILD_ARCHITECTURE.md §5) — Webhooks is the
 * first slice built; OIDC/Entra, API Keys, Notification Channels, and Model Registry get added
 * here once each is actually being built, per this rebuild's "no speculative scaffolding"
 * convention, rather than a tab shell with disabled placeholders today.
 */
export default async function IntegrationsPage() {
  const webhooks = await WebhookDAO.list();

  return (
    <div className="p-6 space-y-4">
      <PageChrome
        toolbar={{
          title: "Integrations",
          description: `${webhooks.length} webhook${webhooks.length === 1 ? "" : "s"} configured`,
          actions: [
            {
              kind: "button",
              id: "new-webhook",
              label: "New webhook",
              variant: "primary",
              icon: <Plus className="w-3.5 h-3.5" />,
              href: "/admin/integrations/webhooks/new",
            },
          ],
        }}
        breadcrumbs={[{ label: "Integrations" }]}
      />

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground-700">Webhooks</h2>
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
