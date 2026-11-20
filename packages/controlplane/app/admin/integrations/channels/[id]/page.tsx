import { notFound } from "next/navigation";
import { NotificationChannelDAO } from "@/db";
import { CONTROLPLANE_WEBHOOK_EVENTS } from "@/lib/webhook-events";
import PageChrome from "@/components/layout/PageChrome";
import { updateChannelAction } from "../../actions";
import AppriseUrlBuilder from "../AppriseUrlBuilder";
import ServiceTypeBadges from "../ServiceTypeBadges";

const EVENT_GROUPS = Array.from(new Set(CONTROLPLANE_WEBHOOK_EVENTS.map((e) => e.group)));

export default async function ChannelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const channel = await NotificationChannelDAO.findById(id);
  if (!channel) notFound();

  const subscribedEvents = new Set(channel.events as string[]);

  return (
    <div className="p-6 max-w-6xl space-y-6">
      <PageChrome
        toolbar={{ title: channel.name }}
        breadcrumbs={[
          { label: "Integrations", href: "/admin/integrations" },
          { label: channel.name },
        ]}
      />

      <div className="flex gap-8">
        <div>
          <div className="mb-1 text-xs text-foreground-500">Type</div>
          <ServiceTypeBadges types={channel.serviceTypes as string[]} />
        </div>
        <div>
          <div className="mb-1 text-xs text-foreground-500">Delivery key</div>
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
            className="w-full rounded-lg border border-neutral-200 bg-background px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Description (optional)</label>
          <input
            type="text"
            name="description"
            defaultValue={channel.description ?? ""}
            className="w-full rounded-lg border border-neutral-200 bg-background px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
          />
        </div>

        <AppriseUrlBuilder
          placeholder="Leave blank to keep the current service URLs"
          helpText={
            <>
              Write-only — the current value is encrypted and never redisplayed. Add replacement
              URLs only if you want to replace the current configuration.
            </>
          }
        />

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Events</label>
          <div className="divide-y divide-neutral-200/60 rounded-lg border border-neutral-200">
            {EVENT_GROUPS.map((group) => (
              <div key={group} className="p-3">
                <div className="mb-2 text-xs text-foreground-500">{group}</div>
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
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-500"
          >
            Save changes
          </button>
        </div>
      </form>
    </div>
  );
}
