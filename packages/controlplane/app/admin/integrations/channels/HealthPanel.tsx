import { CheckCircle2, XCircle, HelpCircle } from "lucide-react";
import { checkIntegrationsHealth, DISPATCHER_QUEUE_PREFIX } from "@/lib/integrations-health";

function StatusPill({
  label,
  state,
  detail,
}: {
  label: string;
  state: "ok" | "error" | "unconfigured";
  detail?: string;
}) {
  const Icon = state === "ok" ? CheckCircle2 : state === "error" ? XCircle : HelpCircle;
  const classes =
    state === "ok"
      ? "bg-success-100 text-success-700 border-success-200"
      : state === "error"
        ? "bg-danger-100 text-danger-700 border-danger-200"
        : "bg-neutral-100 text-foreground-500 border-neutral-200";
  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs ${classes}`}>
      <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <div>
        <div className="font-medium">{label}</div>
        {detail && <div className="opacity-80 mt-0.5">{detail}</div>}
      </div>
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
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      <StatusPill
        label="Redis"
        state={!health.redis.configured ? "unconfigured" : health.redis.ok ? "ok" : "error"}
        detail={
          !health.redis.configured
            ? "REDIS_URL not set — nothing is enqueued at all."
            : health.redis.ok
              ? "Reachable."
              : `Unreachable: ${health.redis.error}`
        }
      />
      <StatusPill
        label="Delivery service"
        state={!health.apprise.configured ? "unconfigured" : health.apprise.ok ? "ok" : "error"}
        detail={
          !health.apprise.configured
            ? "Delivery service URL not set — channels can't be created or notified."
            : health.apprise.ok
              ? "Reachable."
              : `Unreachable: ${health.apprise.error}`
        }
      />
      <StatusPill
        label="Dispatcher"
        state={!health.dispatcher.checked ? "unconfigured" : health.dispatcher.ok ? "ok" : "error"}
        detail={
          !health.dispatcher.checked
            ? "Depends on Redis being configured first."
            : health.dispatcher.error
              ? `Couldn't check: ${health.dispatcher.error}`
              : health.dispatcher.ok
                ? `${health.dispatcher.workerCount} worker${health.dispatcher.workerCount === 1 ? "" : "s"} attached.`
                : `No worker attached to this queue — events are queuing up but never delivered. Run: pnpm controlplane:webhook:dev (prefix "${DISPATCHER_QUEUE_PREFIX}").`
        }
      />
    </div>
  );
}
