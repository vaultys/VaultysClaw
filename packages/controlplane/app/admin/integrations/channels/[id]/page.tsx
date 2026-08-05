import { notFound } from "next/navigation";
import { NotificationChannelDAO } from "@/db";
import { CONTROLPLANE_WEBHOOK_EVENTS } from "@/lib/webhook-events";
import PageChrome from "@/components/layout/PageChrome";
import { updateChannelAction } from "../../actions";
import ServiceTypeBadges from "../ServiceTypeBadges";

const EVENT_GROUPS = Array.from(new Set(CONTROLPLANE_WEBHOOK_EVENTS.map((e) => e.group)));

export default async function ChannelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const channel = await NotificationChannelDAO.findById(id);
  if (!channel) notFound();

  const subscribedEvents = new Set(channel.events as string[]);

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <PageChrome
        toolbar={{ title: channel.name }}
        breadcrumbs={[
          { label: "Integrations", href: "/admin/integrations" },
          { label: channel.name },
        ]}
      />

      <div className="flex gap-8">
        <div>
          <div className="text-xs font-medium text-foreground-500 uppercase mb-1">Type</div>
          <ServiceTypeBadges types={channel.serviceTypes as string[]} />
        </div>
        <div>
          <div className="text-xs font-medium text-foreground-500 uppercase mb-1">Apprise key</div>
          <code className="text-xs font-mono text-foreground-500">{channel.appriseKey}</code>
        </div>
      </div>

      <form action={updateChannelAction} className="space-y-6">
        <input type="hidden" name="id" value={channel.id} />

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Name</label>
          <input
            type="text"
            name="name"
            required
            defaultValue={channel.name}
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Description (optional)</label>
          <input
            type="text"
            name="description"
            defaultValue={channel.description ?? ""}
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Apprise service URL(s)
          </label>
          <textarea
            name="serviceUrls"
            rows={3}
            placeholder="Leave blank to keep the current service URLs"
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background font-mono"
          />
          <p className="text-xs text-foreground-400 mt-1">
            Write-only — the current value is encrypted and never redisplayed. Paste new URLs
            (one per line) only if you want to replace them.
          </p>
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
