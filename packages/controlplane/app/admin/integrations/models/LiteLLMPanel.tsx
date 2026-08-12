import { CheckCircle2, XCircle, HelpCircle } from "lucide-react";
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
  const Icon = state === "ok" ? CheckCircle2 : state === "error" ? XCircle : HelpCircle;
  const pillClasses =
    state === "ok"
      ? "bg-success-100 text-success-700 border-success-200"
      : state === "error"
        ? "bg-danger-100 text-danger-700 border-danger-200"
        : "bg-neutral-100 text-foreground-500 border-neutral-200";

  return (
    <div className="border border-neutral-200/60 rounded-xl p-4 space-y-4 bg-background-100">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">LiteLLM proxy</h2>
          <p className="text-xs text-foreground-400 mt-0.5 max-w-xl">
            Optional. Models registered here are <em>pushed</em> to the proxy, which is what
            actually routes inference. Without it this registry is a catalogue — every model below
            still records fine, it just isn&apos;t reachable through a single endpoint.
          </p>
        </div>
        <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs ${pillClasses}`}>
          <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <div>
            <div className="font-medium">
              {state === "ok" ? "Connected" : state === "error" ? "Unreachable" : "Not configured"}
            </div>
            <div className="opacity-80 mt-0.5">
              {state === "ok"
                ? `${registered.length} model${registered.length === 1 ? "" : "s"} registered.`
                : state === "error"
                  ? "Configured, but the proxy didn't answer."
                  : baseUrl
                    ? "URL set, master key missing."
                    : "No proxy URL set."}
            </div>
          </div>
        </div>
      </div>

      <form action={saveLiteLLMConfigAction} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-foreground-500 mb-1">Proxy URL</label>
          <input
            type="text"
            name="baseUrl"
            defaultValue={baseUrl ?? ""}
            placeholder="http://localhost:4000"
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background font-mono"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground-500 mb-1">Master key</label>
          <input
            type="password"
            name="masterKey"
            placeholder={config ? "Leave blank to keep the current key" : "sk-…"}
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background font-mono"
          />
        </div>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            className="px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white text-xs font-medium rounded-lg transition-colors"
          >
            Save connection
          </button>
          <ResyncButton disabled={!config} />
          <span className="text-xs text-foreground-400">
            Master key is encrypted at rest and never redisplayed.
          </span>
        </div>
      </form>

      {config && (
        <form action={clearLiteLLMConfigAction}>
          <button
            type="submit"
            className="text-xs text-danger-600 hover:underline"
          >
            Disconnect proxy
          </button>
        </form>
      )}
    </div>
  );
}
