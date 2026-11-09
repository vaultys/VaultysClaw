import { Badge } from "@/components/ui/Badge";
import { getLiteLLMConfig, getLiteLLMBaseUrl, healthCheck, listModels } from "@/lib/litellm";
import { saveLiteLLMConfigAction, clearLiteLLMConfigAction } from "../actions";
import ResyncButton from "./ResyncButton";

/**
 * The LiteLLM proxy connection, and what it currently believes.
 *
 * Deliberately reports three states rather than "connected / not connected",
 * because the failure an admin actually hits is the middle one: a base URL saved
 * with no master key, which leaves every registry entry unpushed while the page
 * looks configured. `getLiteLLMBaseUrl()` resolves independently of the key for
 * exactly this reason (see lib/litellm.ts).
 */
export default async function LiteLLMPanel() {
  const [config, baseUrl] = await Promise.all([getLiteLLMConfig(), getLiteLLMBaseUrl()]);
  const reachable = config ? await healthCheck() : false;
  const registered = reachable ? await listModels() : [];

  const state: "ok" | "error" | "unconfigured" = !config
    ? "unconfigured"
    : reachable
      ? "ok"
      : "error";
  return (
    <div className="space-y-4 rounded-xl border border-neutral-200/60 bg-background-100 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-foreground">LiteLLM proxy</h2>
          <p className="mt-0.5 max-w-xl text-xs leading-5 text-foreground-500">
            Optional. Models registered here are pushed to the proxy, which is what
            actually routes inference. Without it this registry is a catalogue — every model below
            still records fine, it just isn&apos;t reachable through a single endpoint.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
          <Badge tone={state === "ok" ? "positive" : state === "error" ? "negative" : "muted"}>
            {state === "ok" ? "Connected" : state === "error" ? "Unreachable" : "Not configured"}
          </Badge>
          <span className="text-xs tabular-nums text-foreground-500">
            {state === "ok"
              ? `${registered.length} model${registered.length === 1 ? "" : "s"} registered`
              : state === "error"
                ? "Configured, but the proxy didn't answer"
                : baseUrl
                  ? "URL set, master key missing"
                  : "No proxy URL set"}
          </span>
        </div>
      </div>

      <form action={saveLiteLLMConfigAction} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">Proxy URL</label>
          <input
            type="text"
            name="baseUrl"
            defaultValue={baseUrl ?? ""}
            placeholder="http://localhost:4000"
            className="w-full rounded-lg border border-neutral-200 bg-background px-3 py-2 font-mono text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">Master key</label>
          <input
            type="password"
            name="masterKey"
            placeholder={config ? "Leave blank to keep the current key" : "sk-…"}
            className="w-full rounded-lg border border-neutral-200 bg-background px-3 py-2 font-mono text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
          />
        </div>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-500"
          >
            Save connection
          </button>
          <ResyncButton disabled={!config} />
          <span className="text-xs text-foreground-500">
            Master key is encrypted at rest and never redisplayed
          </span>
        </div>
      </form>

      {config && (
        <form action={clearLiteLLMConfigAction}>
          <button
            type="submit"
            className="text-xs text-danger-700 hover:underline"
          >
            Disconnect proxy
          </button>
        </form>
      )}
    </div>
  );
}
