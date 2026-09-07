import PageChrome from "@/components/layout/PageChrome";
import { CONTROLPLANE_WEBHOOK_EVENTS } from "@/lib/webhook-events";
import { createChannelAction } from "../../actions";
import AppriseUrlBuilder from "../AppriseUrlBuilder";

const EVENT_GROUPS = Array.from(new Set(CONTROLPLANE_WEBHOOK_EVENTS.map((e) => e.group)));

export default function NewChannelPage() {
  return (
    <div className="p-6">
      <PageChrome
        toolbar={{ title: "New notification channel" }}
        breadcrumbs={[
          { label: "Integrations", href: "/admin/integrations" },
          { label: "New notification channel" },
        ]}
      />

      <form action={createChannelAction} className="space-y-6 max-w-6xl">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Name</label>
          <input
            type="text"
            name="name"
            required
            placeholder="e.g. Ops Slack"
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Description (optional)</label>
          <input
            type="text"
            name="description"
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
          />
        </div>

        <AppriseUrlBuilder
          required
          placeholder={"slack://TokenA/TokenB/TokenC/#channel\nmailto://user:pass@smtp.example.com"}
          helpText={
            <>
              One per line. Build URLs from the local integration metadata, or paste raw service
              URLs directly. These often embed credentials, so they&apos;re encrypted at rest and never
              shown again after this.
            </>
          }
        />

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Events</label>
          <div className="border border-neutral-200 rounded-lg divide-y divide-neutral-200/60">
            {EVENT_GROUPS.map((group) => (
              <div key={group} className="p-3">
                <div className="text-xs font-semibold text-foreground-500 uppercase mb-2">{group}</div>
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                  {CONTROLPLANE_WEBHOOK_EVENTS.filter((e) => e.group === group).map((e) => (
                    <label key={e.type} className="flex items-center gap-1.5 text-foreground-700" title={e.description}>
                      <input type="checkbox" name="events" value={e.type} className="accent-primary-600" />
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
            Create channel
          </button>
        </div>
      </form>
    </div>
  );
}
