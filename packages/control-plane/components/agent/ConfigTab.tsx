"use client";
import { useState, useEffect } from "react";
import { type LlmProviderType } from "@vaultysclaw/shared";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { agentsApi } from "@/lib/api";
import { RealmLlmData, SafeLlmConfig } from "@/types";

interface RegistryModel {
  id: string;
  name: string;
  description: string | null;
  provider: string;
  modelId: string;
  status: string;
  litellmModelName: string | null;
}

interface RealmLlmModel {
  id: string;
  name: string;
  provider: string;
  modelId: string;
  litellmModelName: string | null;
}

interface RealmLlmRealm {
  realmId: string;
  realmName: string;
  isPrimary: boolean;
  hasVirtualKey: boolean;
  models: RealmLlmModel[];
}

const PROVIDER_OPTIONS: {
  value: LlmProviderType;
  label: string;
  needsKey: boolean;
  needsUrl: boolean;
}[] = [
  { value: "openai", label: "OpenAI", needsKey: true, needsUrl: false },
  { value: "anthropic", label: "Anthropic", needsKey: true, needsUrl: false },
  { value: "google", label: "Google Gemini", needsKey: true, needsUrl: false },
  { value: "ollama", label: "Ollama (local)", needsKey: false, needsUrl: true },
  {
    value: "openai-compatible",
    label: "OpenAI-compatible",
    needsKey: true,
    needsUrl: true,
  },
];

const PROVIDER_COLORS: Record<string, string> = {
  openai: "bg-success-100 text-success-700 border-success-300",
  "openai-compatible": "bg-primary-100 text-primary-700 border-primary-300",
  anthropic: "bg-warning-100 text-warning-700 border-warning-300",
  google: "bg-warning-100 text-warning-700 border-warning-300",
  ollama: "bg-secondary-100 text-secondary-700 border-secondary-300",
};

export function ConfigTab({
  did,
  reportedLlm,
}: {
  did: string;
  reportedLlm: { provider: string; model: string } | null;
}) {
  const [llmConfig, setLlmConfig] = useState<SafeLlmConfig | null>(null);
  const [llmLoading, setLlmLoading] = useState(true);
  const [llmEditing, setLlmEditing] = useState(false);
  const [configMode, setConfigMode] = useState<"realm" | "registry" | "manual">(
    "realm"
  );
  const [registryModels, setRegistryModels] = useState<RegistryModel[]>([]);
  const [registryLoading, setRegistryLoading] = useState(false);
  const [selectedRegistryId, setSelectedRegistryId] = useState("");
  const [realmLlmData, setRealmLlmData] = useState<RealmLlmData | null>(null);
  const [selectedRealmId, setSelectedRealmId] = useState("");
  const [selectedRealmModelId, setSelectedRealmModelId] = useState("");
  const [llmForm, setLlmForm] = useState({
    provider: "openai" as LlmProviderType,
    model: "",
    apiKey: "",
    baseUrl: "",
    systemPrompt: "",
    maxTokens: "",
  });
  const [llmSaving, setLlmSaving] = useState(false);
  const [llmStatus, setLlmStatus] = useState<
    "idle" | "saved" | "cleared" | "error"
  >("idle");
  const [llmError, setLlmError] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    Promise.all([
      agentsApi.getLlmConfig(did).then((res) => res),
      fetch("/api/models").then((r) => r.json()),
      agentsApi.getRealmLlm(did).then((res) => res),
    ])
      .then(
        ([configData, modelsData, realmData]: [
          { config: SafeLlmConfig | null },
          { models?: RegistryModel[] },
          RealmLlmData,
        ]) => {
          setLlmConfig(configData.config);
          setRegistryModels(modelsData.models ?? []);
          setRealmLlmData(realmData);
          if (configData.config) {
            setLlmForm({
              provider: configData.config.provider,
              model: configData.config.model,
              apiKey: "",
              baseUrl: configData.config.baseUrl ?? "",
              systemPrompt: configData.config.systemPrompt ?? "",
              maxTokens: configData.config.maxTokens?.toString() ?? "",
            });
          }
        }
      )
      .catch(() => {})
      .finally(() => setLlmLoading(false));
  }, [did]);

  function openEdit() {
    if (llmConfig?.provider === "openai-compatible") {
      const realmWithModel = realmLlmData?.realms.find(
        (r) =>
          r.hasVirtualKey &&
          r.models.some((m) => m.litellmModelName === llmConfig.model)
      );
      if (realmWithModel) {
        const realmModel = realmWithModel.models.find(
          (m) => m.litellmModelName === llmConfig.model
        );
        setSelectedRealmId(realmWithModel.realmId);
        setSelectedRealmModelId(realmModel?.id ?? "");
        setConfigMode("realm");
        setLlmEditing(true);
        return;
      }
      const match = registryModels.find((m) => m.modelId === llmConfig.model);
      if (match) {
        setSelectedRegistryId(match.id);
        setConfigMode("registry");
        setLlmEditing(true);
        return;
      }
      setConfigMode("manual");
    } else if (llmConfig) {
      setConfigMode("manual");
    } else {
      const hasRealmRouting = realmLlmData?.realms.some(
        (r) => r.hasVirtualKey && r.models.length > 0
      );
      if (hasRealmRouting) {
        const firstRealm = realmLlmData!.realms.find(
          (r) => r.hasVirtualKey && r.models.length > 0
        )!;
        setSelectedRealmId(firstRealm.realmId);
        setSelectedRealmModelId(firstRealm.models[0]?.id ?? "");
        setConfigMode("realm");
      } else if (registryModels.length > 0) {
        setConfigMode("registry");
      } else {
        setConfigMode("manual");
      }
    }
    setRegistryLoading(false);
    setLlmEditing(true);
  }

  async function clearConfig() {
    setLlmSaving(true);
    setLlmError(null);
    try {
      await agentsApi.deleteLlmConfig(did);
    } catch {
      setLlmStatus("error");
    } finally {
      setLlmSaving(false);
    }
  }

  async function saveRealmRouting() {
    if (!selectedRealmId || !selectedRealmModelId) return;
    setLlmSaving(true);
    setLlmStatus("idle");
    setLlmError(null);
    try {
      const { config } = await agentsApi.setLlmConfig(did, {
        realmId: selectedRealmId,
        realmModelId: selectedRealmModelId,
      });
      setLlmConfig(config);
      setLlmEditing(false);
      setLlmStatus("saved");
      setTimeout(() => setLlmStatus("idle"), 2500);
    } catch {
      setLlmStatus("error");
    } finally {
      setLlmSaving(false);
    }
  }

  async function saveRegistryModel() {
    if (!selectedRegistryId) return;
    setLlmSaving(true);
    setLlmStatus("idle");
    setLlmError(null);
    try {
      const { config } = await agentsApi.setLlmConfig(did, {
        registryModelId: selectedRegistryId,
      });

      setLlmConfig(config);
      setLlmEditing(false);
      setLlmStatus("saved");
      setTimeout(() => setLlmStatus("idle"), 2500);
    } catch {
      setLlmStatus("error");
    } finally {
      setLlmSaving(false);
    }
  }

  async function saveManualConfig(e: React.FormEvent) {
    e.preventDefault();
    setLlmSaving(true);
    setLlmStatus("idle");
    setLlmError(null);
    try {
      const body: Record<string, unknown> = {
        provider: llmForm.provider,
        model: llmForm.model,
      };
      if (llmForm.apiKey) body.apiKey = llmForm.apiKey;
      if (llmForm.baseUrl) body.baseUrl = llmForm.baseUrl;
      if (llmForm.systemPrompt) body.systemPrompt = llmForm.systemPrompt;
      if (llmForm.maxTokens) body.maxTokens = parseInt(llmForm.maxTokens, 10);
      const { config } = await agentsApi.setLlmConfig(did, body);

      setLlmConfig(config);
      setLlmEditing(false);
      setLlmStatus("saved");
      setTimeout(() => setLlmStatus("idle"), 2500);
    } catch {
      setLlmStatus("error");
    } finally {
      setLlmSaving(false);
    }
  }

  const selectedProvider = PROVIDER_OPTIONS.find(
    (p) => p.value === llmForm.provider
  )!;
  const activeRegistryModel =
    llmConfig?.provider === "openai-compatible"
      ? registryModels.find((m) => m.modelId === llmConfig.model)
      : null;

  const activeRealmRoute =
    llmConfig?.provider === "openai-compatible"
      ? (() => {
          for (const realm of realmLlmData?.realms ?? []) {
            const model = realm.models.find(
              (m) => m.litellmModelName === llmConfig.model
            );
            if (model) return { realm, model };
          }
          return null;
        })()
      : null;

  const hasRealmRouting = Boolean(
    realmLlmData?.litellmConfigured &&
    realmLlmData.realms.some((r) => r.hasVirtualKey && r.models.length > 0)
  );

  if (llmLoading)
    return <p className="text-foreground-500 text-sm">Loading…</p>;

  return (
    <div className="space-y-5">
      <ConfirmModal
        open={showClearConfirm}
        title="Clear LLM config"
        message="The agent will fall back to its local environment variables."
        confirmLabel="Clear config"
        variant="danger"
        loading={llmSaving}
        onConfirm={async () => {
          setShowClearConfirm(false);
          await clearConfig();
        }}
        onCancel={() => setShowClearConfirm(false)}
      />

      {reportedLlm && (
        <div className="bg-background-200 rounded-lg border border-neutral-200 px-4 py-3">
          <div className="text-xs text-foreground-500 uppercase tracking-wider font-medium mb-1.5">
            Agent Active LLM
          </div>
          <div className="flex items-center gap-3">
            <code className="text-sm font-mono text-primary-400">
              {reportedLlm.provider}/{reportedLlm.model}
            </code>
            <span className="text-xs text-foreground-400">
              reported by agent{llmConfig ? "" : " (local env config)"}
            </span>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-neutral-200 bg-background-100 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              LLM Configuration
            </h2>
            <p className="text-xs text-foreground-500 mt-0.5">
              Pushed to the agent remotely on save
            </p>
          </div>
          {!llmEditing && (
            <div className="flex items-center gap-2">
              {llmConfig && (
                <button
                  onClick={() => setShowClearConfirm(true)}
                  className="text-xs text-danger-400 hover:text-danger-300 border border-danger-500/30 px-2.5 py-1.5 rounded-md transition-colors"
                >
                  Clear
                </button>
              )}
              <button
                onClick={openEdit}
                className="text-xs text-primary-400 hover:text-primary-300 border border-primary-500/30 px-2.5 py-1.5 rounded-md transition-colors"
              >
                {llmConfig ? "Edit" : "Configure"}
              </button>
            </div>
          )}
        </div>

        {llmEditing ? (
          <div className="p-4 space-y-4">
            <div className="flex rounded-lg border border-neutral-200 overflow-hidden text-sm">
              {[
                {
                  id: "realm" as const,
                  label: "Realm Routing",
                  disabled: !hasRealmRouting,
                  hint: !realmLlmData?.litellmConfigured
                    ? "LiteLLM not configured"
                    : "no models in realm",
                },
                {
                  id: "registry" as const,
                  label: "From Registry",
                  disabled: registryModels.length === 0,
                  hint: "no models registered",
                },
                {
                  id: "manual" as const,
                  label: "Configure manually",
                  disabled: false,
                  hint: "",
                },
              ].map(({ id, label, disabled, hint }) => (
                <button
                  key={id}
                  onClick={() => !disabled && setConfigMode(id)}
                  disabled={disabled}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    configMode === id
                      ? "bg-primary-600 text-white"
                      : disabled
                        ? "bg-background text-foreground-400 cursor-not-allowed"
                        : "bg-background text-foreground-500 hover:text-foreground hover:bg-background-200"
                  }`}
                  title={disabled ? hint : undefined}
                >
                  {label}
                </button>
              ))}
            </div>

            {llmError && (
              <p className="text-xs text-danger-500 bg-danger-50 border border-danger-200 rounded-lg px-3 py-2">
                {llmError}
              </p>
            )}

            {configMode === "realm" ? (
              <div className="space-y-3">
                <p className="text-xs text-foreground-500">
                  Route this agent through your LiteLLM proxy using a
                  realm-scoped virtual key. The API key is resolved server-side.
                </p>
                {(realmLlmData?.realms ?? [])
                  .filter((r) => r.hasVirtualKey && r.models.length > 0)
                  .map((realm) => (
                    <div key={realm.realmId} className="space-y-1.5">
                      <div className="flex items-center gap-2 text-xs text-foreground-500 font-medium uppercase tracking-wider">
                        <span>{realm.realmName}</span>
                        {realm.isPrimary && (
                          <span className="px-1.5 py-0.5 rounded-full bg-primary-100 text-primary-700 border border-primary-300 text-[10px] font-semibold">
                            Primary
                          </span>
                        )}
                      </div>
                      {realm.models.map((model) => (
                        <label
                          key={model.id}
                          className={`flex items-center gap-3 px-3 py-3 rounded-xl border cursor-pointer transition-colors ${
                            selectedRealmId === realm.realmId &&
                            selectedRealmModelId === model.id
                              ? "border-primary-500 bg-primary-50"
                              : "border-neutral-200 hover:border-neutral-300 hover:bg-background-200/50"
                          }`}
                        >
                          <input
                            type="radio"
                            name="realm-model"
                            checked={
                              selectedRealmId === realm.realmId &&
                              selectedRealmModelId === model.id
                            }
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
                                className={`text-xs px-1.5 py-0.5 rounded-full border font-medium ${PROVIDER_COLORS[model.provider] ?? "bg-neutral-100 text-neutral-600 border-neutral-300"}`}
                              >
                                {model.provider}
                              </span>
                            </div>
                            <code className="text-xs text-foreground-400 font-mono">
                              {model.litellmModelName ?? model.modelId}
                            </code>
                          </div>
                        </label>
                      ))}
                    </div>
                  ))}
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setLlmEditing(false);
                      setLlmStatus("idle");
                    }}
                    className="text-sm text-foreground-500 hover:text-foreground px-3 py-1.5"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={
                      !selectedRealmId || !selectedRealmModelId || llmSaving
                    }
                    onClick={saveRealmRouting}
                    className="px-4 py-1.5 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-40 transition"
                  >
                    {llmSaving ? "Saving…" : "Use realm routing"}
                  </button>
                  <a
                    href="/models"
                    className="text-xs text-foreground-500 hover:text-foreground ml-auto transition-colors"
                  >
                    Manage models →
                  </a>
                </div>
              </div>
            ) : configMode === "registry" ? (
              <div className="space-y-3">
                <p className="text-xs text-foreground-500">
                  Select a model from the registry. Endpoint and credentials are
                  resolved server-side.
                </p>
                {registryLoading ? (
                  <p className="text-xs text-foreground-500 py-4 text-center">
                    Loading registry…
                  </p>
                ) : (
                  <div className="space-y-2">
                    {registryModels
                      .filter((m) => m.status === "active")
                      .map((m) => (
                        <label
                          key={m.id}
                          className={`flex items-center gap-3 px-3 py-3 rounded-xl border cursor-pointer transition-colors ${
                            selectedRegistryId === m.id
                              ? "border-primary-500 bg-primary-50"
                              : "border-neutral-200 hover:border-neutral-300 hover:bg-background-200/50"
                          }`}
                        >
                          <input
                            type="radio"
                            name="registry-model"
                            value={m.id}
                            checked={selectedRegistryId === m.id}
                            onChange={() => setSelectedRegistryId(m.id)}
                            className="accent-primary-600 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-foreground">
                                {m.name}
                              </span>
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded-full border font-medium ${PROVIDER_COLORS[m.provider] ?? "bg-neutral-100 text-neutral-600 border-neutral-300"}`}
                              >
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
                      ))}
                  </div>
                )}
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setLlmEditing(false);
                      setLlmStatus("idle");
                    }}
                    className="text-sm text-foreground-500 hover:text-foreground px-3 py-1.5"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={!selectedRegistryId || llmSaving}
                    onClick={saveRegistryModel}
                    className="px-4 py-1.5 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-40 transition"
                  >
                    {llmSaving ? "Saving…" : "Use this model"}
                  </button>
                  <a
                    href="/models"
                    className="text-xs text-foreground-500 hover:text-foreground ml-auto transition-colors"
                  >
                    Manage registry →
                  </a>
                </div>
              </div>
            ) : (
              <form onSubmit={saveManualConfig} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-foreground-500 uppercase tracking-wider font-medium block mb-1.5">
                      Provider
                    </label>
                    <select
                      value={llmForm.provider}
                      onChange={(e) =>
                        setLlmForm((f) => ({
                          ...f,
                          provider: e.target.value as LlmProviderType,
                        }))
                      }
                      className="w-full bg-background-200 border border-neutral-300 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                    >
                      {PROVIDER_OPTIONS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-foreground-500 uppercase tracking-wider font-medium block mb-1.5">
                      Model
                    </label>
                    <input
                      type="text"
                      required
                      value={llmForm.model}
                      onChange={(e) =>
                        setLlmForm((f) => ({ ...f, model: e.target.value }))
                      }
                      placeholder={
                        llmForm.provider === "openai"
                          ? "gpt-4o"
                          : llmForm.provider === "anthropic"
                            ? "claude-sonnet-4-5"
                            : llmForm.provider === "google"
                              ? "gemini-2.5-flash"
                              : llmForm.provider === "ollama"
                                ? "llama3.2"
                                : "model-name"
                      }
                      className="w-full bg-background-200 border border-neutral-300 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                    />
                  </div>
                  {selectedProvider.needsKey && (
                    <div>
                      <label className="text-xs text-foreground-500 uppercase tracking-wider font-medium block mb-1.5">
                        API Key{" "}
                        {llmConfig?.apiKeySet && (
                          <span className="text-success-500 normal-case">
                            (stored — leave blank to keep)
                          </span>
                        )}
                      </label>
                      <input
                        type="password"
                        value={llmForm.apiKey}
                        onChange={(e) =>
                          setLlmForm((f) => ({ ...f, apiKey: e.target.value }))
                        }
                        placeholder={
                          llmConfig?.apiKeySet ? "••••••••••••••••" : "sk-…"
                        }
                        className="w-full bg-background-200 border border-neutral-300 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                      />
                    </div>
                  )}
                  {selectedProvider.needsUrl && (
                    <div>
                      <label className="text-xs text-foreground-500 uppercase tracking-wider font-medium block mb-1.5">
                        Base URL
                      </label>
                      <input
                        type="url"
                        value={llmForm.baseUrl}
                        onChange={(e) =>
                          setLlmForm((f) => ({
                            ...f,
                            baseUrl: e.target.value,
                          }))
                        }
                        placeholder={
                          llmForm.provider === "ollama"
                            ? "http://localhost:11434/api"
                            : "http://localhost:1234/v1"
                        }
                        className="w-full bg-background-200 border border-neutral-300 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-xs text-foreground-500 uppercase tracking-wider font-medium block mb-1.5">
                      Max Tokens{" "}
                      <span className="normal-case text-foreground-400">
                        (optional)
                      </span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={llmForm.maxTokens}
                      onChange={(e) =>
                        setLlmForm((f) => ({
                          ...f,
                          maxTokens: e.target.value,
                        }))
                      }
                      placeholder="4096"
                      className="w-full bg-background-200 border border-neutral-300 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-foreground-500 uppercase tracking-wider font-medium block mb-1.5">
                    System Prompt{" "}
                    <span className="normal-case text-foreground-400">
                      (optional — overrides default)
                    </span>
                  </label>
                  <textarea
                    rows={4}
                    value={llmForm.systemPrompt}
                    onChange={(e) =>
                      setLlmForm((f) => ({
                        ...f,
                        systemPrompt: e.target.value,
                      }))
                    }
                    placeholder="You are a secure agent…"
                    className="w-full bg-background-200 border border-neutral-300 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 resize-y"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setLlmEditing(false);
                      setLlmStatus("idle");
                    }}
                    className="text-sm text-foreground-500 hover:text-foreground px-3 py-1.5"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={llmSaving}
                    className="px-4 py-1.5 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-40 transition"
                  >
                    {llmSaving ? "Saving…" : "Save & Push to Agent"}
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : llmConfig ? (
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
            {[
              {
                label: "Provider",
                value:
                  PROVIDER_OPTIONS.find((p) => p.value === llmConfig.provider)
                    ?.label ?? llmConfig.provider,
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
                        <span className="font-mono text-xs">
                          {llmConfig.baseUrl}
                        </span>
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
                ? [
                    {
                      label: "Max Tokens",
                      value: llmConfig.maxTokens.toString(),
                    },
                  ]
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
            ].map(({ label, value }) => (
              <div key={label} className="flex items-start gap-4 px-4 py-3">
                <div className="w-28 flex-shrink-0 text-xs text-foreground-500 uppercase pt-0.5">
                  {label}
                </div>
                <div className="flex-1 text-sm text-foreground">{value}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 py-8 text-center">
            <p className="text-foreground-500 text-sm">
              No remote config set. The agent uses its local environment
              variables{" "}
              <code className="text-xs bg-background-200 px-1.5 py-0.5 rounded">
                LLM_PROVIDER
              </code>
              ,{" "}
              <code className="text-xs bg-background-200 px-1.5 py-0.5 rounded">
                LLM_MODEL
              </code>
              , etc.
            </p>
            {hasRealmRouting && (
              <p className="text-xs text-foreground-500 mt-2">
                Realm routing is available — click Configure to route via your
                LiteLLM proxy.
              </p>
            )}
            {!hasRealmRouting && registryModels.length > 0 && (
              <p className="text-xs text-foreground-500 mt-2">
                {registryModels.length} model
                {registryModels.length !== 1 ? "s" : ""} available in the
                registry — click Configure to assign one.
              </p>
            )}
          </div>
        )}
      </div>

      {llmStatus === "saved" && (
        <p className="text-success-600 text-xs">
          ✓ Config saved and pushed to agent
        </p>
      )}
      {llmStatus === "cleared" && (
        <p className="text-success-600 text-xs">✓ Config cleared</p>
      )}
      {llmStatus === "error" && !llmError && (
        <p className="text-danger-500 text-xs">Failed to update config</p>
      )}
    </div>
  );
}
