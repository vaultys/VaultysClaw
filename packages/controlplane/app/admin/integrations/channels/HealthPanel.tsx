import { Badge } from "@/components/ui/Badge";
import { checkIntegrationsHealth, DISPATCHER_QUEUE_PREFIX } from "@/lib/integrations-health";

const STATE_BADGE = {
  ok: { tone: "positive", label: "ok" },
  error: { tone: "negative", label: "error" },
  unconfigured: { tone: "muted", label: "not configured" },
} as const;

function StatusPill({
  label,
  state,
  detail,
}: {
  label: string;
  state: "ok" | "error" | "unconfigured";
  detail?: string;
}) {
  const badge = STATE_BADGE[state];
  return (
    <div className="rounded-lg border border-neutral-200/60 bg-background-100 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </div>
      {detail && <div className="mt-1 text-xs leading-5 text-foreground-500">{detail}</div>}
    </div>
  );
}

/**
 * Answers "will a Notification Channel actually fire?" — Redis and Apprise being reachable isn't
 * enough on its own: an event can be enqueued correctly and still never arrive because nothing is
 * consuming the queue (no packages/webhook-dispatcher instance running for this schema). That
 * exact gap is why this exists — it was otherwise invisible until an admin noticed a specific
 * notification never showed up.
 */
export default async function HealthPanel() {
  const health = await checkIntegrationsHealth();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <StatusPill
        label="Redis"
        state={!health.redis.configured ? "unconfigured" : health.redis.ok ? "ok" : "error"}
        detail={
          !health.redis.configured
            ? "REDIS_URL not set — nothing is enqueued at all"
            : health.redis.ok
              ? "Reachable"
              : `Unreachable: ${health.redis.error}`
        }
      />
      <StatusPill
        label="Delivery service"
        state={!health.apprise.configured ? "unconfigured" : health.apprise.ok ? "ok" : "error"}
        detail={
          !health.apprise.configured
            ? "Delivery service URL not set — channels can't be created or notified"
            : health.apprise.ok
              ? "Reachable"
              : `Unreachable: ${health.apprise.error}`
        }
      />
      <StatusPill
        label="Dispatcher"
        state={!health.dispatcher.checked ? "unconfigured" : health.dispatcher.ok ? "ok" : "error"}
        detail={
          !health.dispatcher.checked
            ? "Depends on Redis being configured first"
            : health.dispatcher.error
              ? `Couldn't check: ${health.dispatcher.error}`
              : health.dispatcher.ok
                ? `${health.dispatcher.workerCount} worker${health.dispatcher.workerCount === 1 ? "" : "s"} attached`
                : `No worker attached to this queue — events are queuing up but never delivered. Run: pnpm controlplane:webhook:dev (prefix "${DISPATCHER_QUEUE_PREFIX}")`
        }
      />
    </div>
  );
}
