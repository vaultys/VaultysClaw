import PageChrome from "@/components/layout/PageChrome";
import { CONTROLPLANE_WEBHOOK_EVENTS } from "@/lib/webhook-events";
import { createChannelAction } from "../../actions";

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

      <form action={createChannelAction} className="space-y-6 max-w-2xl">
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

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Apprise service URL(s)
          </label>
          <textarea
            name="serviceUrls"
            required
            rows={3}
            placeholder={"slack://TokenA/TokenB/TokenC/#channel\nmailto://user:pass@smtp.example.com"}
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background font-mono"
          />
          <p className="text-xs text-foreground-400 mt-1">
            One per line. See{" "}
            <a
              href="https://github.com/caronc/apprise#popular-notification-services"
              target="_blank"
              rel="noreferrer"
              className="text-primary-600 hover:underline"
            >
              Apprise&apos;s service URL reference
            </a>{" "}
            for the full list (Slack, email, PagerDuty, ntfy, Discord, and dozens more). These often
            embed credentials, so they&apos;re encrypted at rest and never shown again after this.
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
