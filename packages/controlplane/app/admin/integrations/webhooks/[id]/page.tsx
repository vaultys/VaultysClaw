import { notFound } from "next/navigation";
import { WebhookDAO } from "@/db";
import { CONTROLPLANE_WEBHOOK_EVENTS } from "@/lib/webhook-events";
import PageChrome from "@/components/layout/PageChrome";
import { secretPreview } from "@/lib/webhook-secret";
import { updateWebhookAction } from "../../actions";
import RegenerateSecretButton from "../RegenerateSecretButton";

const EVENT_GROUPS = Array.from(new Set(CONTROLPLANE_WEBHOOK_EVENTS.map((e) => e.group)));

export default async function WebhookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const webhook = await WebhookDAO.findById(id);
  if (!webhook) notFound();

  const subscribedEvents = new Set(webhook.events as string[]);

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <PageChrome
        toolbar={{ title: webhook.name }}
        breadcrumbs={[
          { label: "Integrations", href: "/admin/integrations" },
          { label: webhook.name },
        ]}
      />

      <div>
        <div className="text-xs font-medium text-foreground-500 uppercase mb-1">Signing secret</div>
        <div className="flex items-center gap-3">
          <code className="text-xs font-mono text-foreground-500">{secretPreview(webhook.secret)}</code>
          <RegenerateSecretButton id={webhook.id} />
        </div>
      </div>

      <form action={updateWebhookAction} className="space-y-6">
        <input type="hidden" name="id" value={webhook.id} />

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Name</label>
          <input
            type="text"
            name="name"
            required
            defaultValue={webhook.name}
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Description (optional)</label>
          <input
            type="text"
            name="description"
            defaultValue={webhook.description ?? ""}
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Endpoint URL</label>
          <input
            type="text"
            name="url"
            required
            defaultValue={webhook.url}
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background font-mono"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Events</label>
          <div className="border border-neutral-200 rounded-lg divide-y divide-neutral-200/60">
            {EVENT_GROUPS.map((group) => (
              <div key={group} className="p-3">
                <div className="text-xs font-semibold text-foreground-500 uppercase mb-2">{group}</div>
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                  {CONTROLPLANE_WEBHOOK_EVENTS.filter((e) => e.group === group).map((e) => (
                    <label
                      key={e.type}
                      className="flex items-center gap-1.5 text-foreground-700"
                      title={e.description}
                    >
                      <input
                        type="checkbox"
                        name="events"
                        value={e.type}
                        defaultChecked={subscribedEvents.has(e.type)}
                        className="accent-primary-600"
                      />
                      {e.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Save changes
          </button>
        </div>
      </form>
    </div>
  );
}
