"use client";

import { useEffect, useState } from "react";
import { Check, ChevronRight, Loader2, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { agentsClient, modelsClient, unwrap } from "@/lib/api/ts-rest/client";
import type { Model, LiteLlmModel } from "./constants";

interface ModelStepProps {
  /** DID of the just-approved agent, or null if approval was skipped. */
  agentDid: string | null;
  /** Advance to the next step. */
  onDone: () => void;
}

export function ModelStep({ agentDid, onDone }: ModelStepProps) {
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [savingModel, setSavingModel] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  const [liteLlmModels, setLiteLlmModels] = useState<LiteLlmModel[]>([]);
  const [liteLlmConfigured, setLiteLlmConfigured] = useState(false);
  const [selectedLiteLlmModel, setSelectedLiteLlmModel] = useState<
    string | null
  >(null);
  const [modelMode, setModelMode] = useState<"registry" | "litellm">(
    "registry"
  );

  // Load registry + LiteLLM models on mount
  useEffect(() => {
    modelsClient
      .list()
      .then((res) => setModels(unwrap(res).models))
      .catch(() => {});

    fetch("/api/litellm/models")
      .then((r) => r.json())
      .then((d: { models?: LiteLlmModel[]; configured?: boolean }) => {
        setLiteLlmModels(d.models ?? []);
        setLiteLlmConfigured(d.configured ?? false);
      })
      .catch(() => {});
  }, []);

  const hasSelection =
    (modelMode === "registry" && selectedModel) ||
    (modelMode === "litellm" && selectedLiteLlmModel);

  async function saveModel() {
    // Nothing to persist (approval skipped or no selection) — just continue
    if (!agentDid || !hasSelection) {
      onDone();
      return;
    }

    setSavingModel(true);
    setModelError(null);
    try {
      if (modelMode === "registry" && selectedModel) {
        unwrap(
          await agentsClient.setLlmConfig({
            params: { did: agentDid },
            body: { registryModelId: selectedModel },
          })
        );
      } else if (modelMode === "litellm" && selectedLiteLlmModel) {
        // Create/validate LiteLLM key for this model
        await fetch(`/api/agents/${agentDid}/litellm-key`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ allowedModels: [selectedLiteLlmModel] }),
        }).then((r) => {
          if (!r.ok) throw new Error("Failed to create LiteLLM key");
          return r.json();
        });
      }
      onDone();
    } catch (err) {
      setModelError(
        err instanceof Error ? err.message : "Network error while saving model"
      );
    } finally {
      setSavingModel(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1">
          Choose a model
        </h2>
        <p className="text-sm text-foreground-500">
          Select the LLM this agent will use. You can change this later from the
          agent&apos;s config tab.
        </p>
      </div>

      {/* Mode selector */}
      {liteLlmConfigured && liteLlmModels.length > 0 && (
        <div className="flex gap-2 border-b border-neutral-200">
          <button
            onClick={() => setModelMode("registry")}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              modelMode === "registry"
                ? "border-primary-500 text-primary-600"
                : "border-transparent text-foreground-500 hover:text-foreground"
            )}
          >
            Registry Models
          </button>
          <button
            onClick={() => setModelMode("litellm")}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              modelMode === "litellm"
                ? "border-primary-500 text-primary-600"
                : "border-transparent text-foreground-500 hover:text-foreground"
            )}
          >
            LiteLLM Models
          </button>
        </div>
      )}

      {/* Registry Models */}
      {modelMode === "registry" && (
        <>
          {models.length === 0 ? (
            <div className="bg-background-100 border border-neutral-200 rounded-xl p-6 text-center text-sm text-foreground-500">
              <Cpu size={20} className="mx-auto mb-2 text-foreground-400" />
              No models registered yet. You can configure one later from the
              Model Registry.
            </div>
          ) : (
            <div className="space-y-2">
              {models
                .filter((m) => m.status === "active")
                .map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedModel(m.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-sm text-left transition-colors",
                      selectedModel === m.id
                        ? "bg-primary-50 border-primary-300"
                        : "bg-background-100 border-neutral-200 hover:bg-background-200"
                    )}
                  >
                    <Cpu
                      size={16}
                      className={
                        selectedModel === m.id
                          ? "text-primary-500"
                          : "text-foreground-500"
                      }
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">
                        {m.name}
                      </p>
                      <p className="text-xs text-foreground-500 truncate">
                        {m.provider} · {m.modelId}
                      </p>
                    </div>
                    {selectedModel === m.id && (
                      <Check size={14} className="text-primary-500 shrink-0" />
                    )}
                  </button>
                ))}
            </div>
          )}
        </>
      )}

      {/* LiteLLM Models */}
      {modelMode === "litellm" && (
        <>
          {!liteLlmConfigured ? (
            <div className="bg-background-100 border border-neutral-200 rounded-xl p-6 text-center text-sm text-foreground-500">
              <Cpu size={20} className="mx-auto mb-2 text-foreground-400" />
              LiteLLM is not configured. Use registry models instead.
            </div>
          ) : liteLlmModels.length === 0 ? (
            <div className="bg-background-100 border border-neutral-200 rounded-xl p-6 text-center text-sm text-foreground-500">
              <Cpu size={20} className="mx-auto mb-2 text-foreground-400" />
              No models available in LiteLLM.
            </div>
          ) : (
            <div className="space-y-2">
              {liteLlmModels.map((m) => (
                <button
                  key={m.name}
                  onClick={() => setSelectedLiteLlmModel(m.name)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-sm text-left transition-colors",
                    selectedLiteLlmModel === m.name
                      ? "bg-primary-50 border-primary-300"
                      : "bg-background-100 border-neutral-200 hover:bg-background-200"
                  )}
                >
                  <Cpu
                    size={16}
                    className={
                      selectedLiteLlmModel === m.name
                        ? "text-primary-500"
                        : "text-foreground-500"
                    }
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {m.name}
                    </p>
                    {typeof m.params === "object" && m.params && (
                      <p className="text-xs text-foreground-500 truncate">
                        {Object.entries(m.params)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                  {selectedLiteLlmModel === m.name && (
                    <Check size={14} className="text-primary-500 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {modelError && (
        <div className="rounded-lg border border-danger-300 bg-danger-50 p-3 text-sm text-danger-600">
          <p className="font-medium">Error: {modelError}</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          onClick={onDone}
          className="text-sm text-foreground-500 hover:text-foreground transition-colors"
        >
          Skip for now
        </button>
        <button
          onClick={saveModel}
          disabled={savingModel}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {savingModel ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <ChevronRight size={15} />
          )}
          {hasSelection ? "Apply & continue" : "Continue"}
        </button>
      </div>
    </div>
  );
}
