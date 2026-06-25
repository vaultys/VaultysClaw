"use client";

import type { AgentLlmConfigController } from "@/hooks/useAgentLlmConfig";
import { PROVIDER_COLORS } from "./constants";
import { FormActions } from "./FormActions";

export function RealmRoutingForm({ cfg }: { cfg: AgentLlmConfigController }) {
  const {
    realmLlmData,
    selectedRealmId,
    setSelectedRealmId,
    selectedRealmModelId,
    setSelectedRealmModelId,
    llmSaving,
    cancelEdit,
    saveRealmRouting,
  } = cfg;

  const realms = (realmLlmData?.realms ?? []).filter(
    (r) => r.hasVirtualKey && r.models.length > 0
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-foreground-500">
        Route this agent through your LiteLLM proxy using a realm-scoped virtual
        key. The API key is resolved server-side.
      </p>
      {realms.map((realm) => (
        <div key={realm.realmId} className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-foreground-500 font-medium uppercase tracking-wider">
            <span>{realm.realmName}</span>
            {realm.isPrimary && (
              <span className="px-1.5 py-0.5 rounded-full bg-primary-100 text-primary-700 border border-primary-300 text-[10px] font-semibold">
                Primary
              </span>
            )}
          </div>
          {realm.models.map((model) => {
            const selected =
              selectedRealmId === realm.realmId &&
              selectedRealmModelId === model.id;
            return (
              <label
                key={model.id}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl border cursor-pointer transition-colors ${
                  selected
                    ? "border-primary-500 bg-primary-50"
                    : "border-neutral-200 hover:border-neutral-300 hover:bg-background-200/50"
                }`}
              >
                <input
                  type="radio"
                  name="realm-model"
                  checked={selected}
                  onChange={() => {
                    setSelectedRealmId(realm.realmId);
                    setSelectedRealmModelId(model.id);
                  }}
                  className="accent-primary-600 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">
                      {model.name}
                    </span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded-full border font-medium ${
                        PROVIDER_COLORS[model.provider] ??
                        "bg-neutral-100 text-neutral-600 border-neutral-300"
                      }`}
                    >
                      {model.provider}
                    </span>
                  </div>
                  <code className="text-xs text-foreground-400 font-mono">
                    {model.litellmModelName ?? model.modelId}
                  </code>
                </div>
              </label>
            );
          })}
        </div>
      ))}
      <FormActions
        onCancel={cancelEdit}
        onSave={saveRealmRouting}
        saveLabel="Use realm routing"
        saving={llmSaving}
        disabled={!selectedRealmId || !selectedRealmModelId}
        showManageModels
      />
    </div>
  );
}
