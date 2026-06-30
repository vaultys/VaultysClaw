import type { AgentLlmConfigController } from "@/hooks/useAgentLlmConfig";
import { PROVIDER_OPTIONS } from "./constants";
import { DetailRows, type DetailRow } from "./DetailRows";

/** Read-only display for a manual / realm / registry LLM config. */
export function LlmConfigView({ cfg }: { cfg: AgentLlmConfigController }) {
  const { llmConfig, activeRealmRoute, activeRegistryModel } = cfg;
  if (!llmConfig) return null;

  const rows: DetailRow[] = [
    {
      label: "Provider",
      value:
        PROVIDER_OPTIONS.find((p) => p.value === llmConfig.provider)?.label ??
        llmConfig.provider,
    },
    {
      label: "Model",
      value: <span className="font-mono">{llmConfig.model}</span>,
    },
    ...(llmConfig.baseUrl
      ? [
          {
            label: "Base URL",
            value: (
              <span className="font-mono text-xs">{llmConfig.baseUrl}</span>
            ),
          },
        ]
      : []),
    {
      label: "API Key",
      value: llmConfig.apiKeySet ? (
        <span className="text-success-600">Stored</span>
      ) : (
        <span className="text-foreground-400">Not set</span>
      ),
    },
    ...(llmConfig.maxTokens
      ? [{ label: "Max Tokens", value: llmConfig.maxTokens.toString() }]
      : []),
    ...(llmConfig.systemPrompt
      ? [
          {
            label: "System Prompt",
            value: (
              <span className="whitespace-pre-wrap text-foreground-700 text-xs">
                {llmConfig.systemPrompt}
              </span>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="divide-y divide-neutral-200">
      {activeRealmRoute && (
        <div className="flex items-center gap-3 px-4 py-3 bg-secondary-50">
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-secondary-100 text-secondary-700 border border-secondary-300 shrink-0">
            Realm Routing
          </span>
          <span className="text-sm text-foreground font-medium">
            {activeRealmRoute.model.name}
          </span>
          <span className="text-xs text-foreground-500">
            via {activeRealmRoute.realm.realmName}
          </span>
          <a
            href={`/models/${activeRealmRoute.model.id}`}
            className="ml-auto text-xs text-secondary-500 hover:text-secondary-400 transition-colors shrink-0"
          >
            View model →
          </a>
        </div>
      )}
      {!activeRealmRoute && activeRegistryModel && (
        <div className="flex items-center gap-3 px-4 py-3 bg-primary-50">
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 border border-primary-300 shrink-0">
            Registry
          </span>
          <span className="text-sm text-foreground font-medium">
            {activeRegistryModel.name}
          </span>
          <a
            href={`/models/${activeRegistryModel.id}`}
            className="ml-auto text-xs text-primary-400 hover:text-primary-300 transition-colors shrink-0"
          >
            View model →
          </a>
        </div>
      )}
      <DetailRows rows={rows} />
    </div>
  );
}
