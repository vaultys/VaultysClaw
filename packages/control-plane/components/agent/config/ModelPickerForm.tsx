"use client";

import type { AgentLlmConfigController } from "@/hooks/useAgentLlmConfig";
import { FormActions } from "./FormActions";

export function ModelPickerForm({ cfg }: { cfg: AgentLlmConfigController }) {
  const {
    liteLlmModels,
    registryModels,
    selectedSource,
    setSelectedSource,
    selectedLiteLlmModel,
    setSelectedLiteLlmModel,
    selectedRegistryId,
    setSelectedRegistryId,
    llmSaving,
    cancelEdit,
    saveSelectedModel,
  } = cfg;

  const activeRegistry = registryModels.filter((m) => m.status === "active");
  const saveDisabled =
    (selectedSource === "litellm" && !selectedLiteLlmModel) ||
    (selectedSource === "registry" && !selectedRegistryId);

  return (
    <div className="space-y-3">
      {(liteLlmModels.length > 0 || activeRegistry.length > 0) && (
        <div className="space-y-1.5">
          {/* LiteLLM proxy models first */}
          {liteLlmModels.map((m) => {
            const selected =
              selectedSource === "litellm" && selectedLiteLlmModel === m.name;
            const paramKeys =
              typeof m.params === "object" && m.params
                ? Object.keys(m.params)
                : [];
            return (
              <label
                key={`litellm:${m.name}`}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl border cursor-pointer transition-colors ${
                  selected
                    ? "border-primary-500 bg-primary-50"
                    : "border-neutral-200 hover:border-neutral-300 hover:bg-background-200/50"
                }`}
              >
                <input
                  type="radio"
                  name="unified-model"
                  checked={selected}
                  onChange={() => {
                    setSelectedSource("litellm");
                    setSelectedLiteLlmModel(m.name);
                  }}
                  className="accent-primary-600 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">
                      {m.name}
                    </span>
                    <span className="text-[10px] text-foreground-400">
                      via proxy
                    </span>
                  </div>
                  {paramKeys.length > 0 && (
                    <code className="text-xs text-foreground-400 font-mono truncate block">
                      {Object.entries(m.params)
                        .slice(0, 2)
                        .map(([k, v]) => `${k}: ${String(v).substring(0, 30)}`)
                        .join(" · ")}
                    </code>
                  )}
                </div>
              </label>
            );
          })}
          {/* Registry models */}
          {activeRegistry.map((m) => {
            const selected =
              selectedSource === "registry" && selectedRegistryId === m.id;
            return (
              <label
                key={`registry:${m.id}`}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl border cursor-pointer transition-colors ${
                  selected
                    ? "border-primary-500 bg-primary-50"
                    : "border-neutral-200 hover:border-neutral-300 hover:bg-background-200/50"
                }`}
              >
                <input
                  type="radio"
                  name="unified-model"
                  checked={selected}
                  onChange={() => {
                    setSelectedSource("registry");
                    setSelectedRegistryId(m.id);
                  }}
                  className="accent-primary-600 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">
                      {m.name}
                    </span>
                    <span className="text-[10px] text-foreground-400">
                      {m.provider}
                    </span>
                  </div>
                  <code className="text-xs text-foreground-400 font-mono">
                    {m.modelId}
                  </code>
                  {m.description && (
                    <p className="text-xs text-foreground-500 mt-0.5">
                      {m.description}
                    </p>
                  )}
                </div>
              </label>
            );
          })}
        </div>
      )}

      <FormActions
        onCancel={cancelEdit}
        onSave={saveSelectedModel}
        saveLabel="Use this model"
        saving={llmSaving}
        disabled={saveDisabled}
        showManageModels
      />
    </div>
  );
}
