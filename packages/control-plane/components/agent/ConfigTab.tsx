"use client";
import { useState, useEffect, useCallback } from "react";
import { type LlmProviderType } from "@vaultysclaw/shared";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import {
  agentsClient,
  litellmClient,
  modelsClient,
  unwrap,
} from "@/lib/api/ts-rest/client";

import { Key, RefreshCw } from "lucide-react";
import Link from "next/link";
import { SafeLlmConfig, SafeModel, type AgentInfo } from "@/lib/contracts";
import { RealmLlmData } from "@/types/api/responses";

interface AgentKeyInfo {
  configured: boolean;
  keyPrefix: string | null;
  allowedModels: string[];
  dailyBudget: number | null;
  updatedAt: string | null;
  litellmConfigured: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

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

type ConfigMode = "agent-key" | "realm" | "model" | "manual";

type ModelSource = "litellm" | "registry";

// ─── Component ───────────────────────────────────────────────────────────────

export function ConfigTab({
  agent,
  onChanged,
}: {
  agent: AgentInfo;
  /** Ask the parent to refetch the agent after a key mutation. */
  onChanged?: () => void | Promise<void>;
}) {
  const did = agent.did;
  const reportedLlm = agent.reportedLlm;

  // LLM config (manually stored)
  const [llmConfig, setLlmConfig] = useState<SafeLlmConfig | null>(null);
  const [llmLoading, setLlmLoading] = useState(true);
  const [llmEditing, setLlmEditing] = useState(false);
  const [configMode, setConfigMode] = useState<ConfigMode>("realm");

  // Registry / realm routing helpers
  const [registryModels, setRegistryModels] = useState<SafeModel[]>([]);
  const [selectedRegistryId, setSelectedRegistryId] = useState("");
  const [realmLlmData, setRealmLlmData] = useState<RealmLlmData | null>(null);
  const [selectedRealmId, setSelectedRealmId] = useState("");
  const [selectedRealmModelId, setSelectedRealmModelId] = useState("");

  // Unified model picker
  const [selectedSource, setSelectedSource] = useState<ModelSource>("litellm");

  // Manual config form
  const [llmForm, setLlmForm] = useState({
    provider: "openai" as LlmProviderType,
    model: "",
    apiKey: "",
    baseUrl: "",
    systemPrompt: "",
    maxTokens: "",
  });

  // Agent LiteLLM key form state (the key itself is derived from `agent`)
  const [litellmConfigured, setLitellmConfigured] = useState(false);
  const [keyModels, setKeyModels] = useState<string[]>([]);
  const [keyModelInput, setKeyModelInput] = useState("");
  const [keyBudget, setKeyBudget] = useState("");
  const [keySaving, setKeySaving] = useState(false);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [revoking, setRevoking] = useState(false);

  // LiteLLM models
  const [liteLlmModels, setLiteLlmModels] = useState<
    { name: string; params: Record<string, unknown> }[]
  >([]);
  const [selectedLiteLlmModel, setSelectedLiteLlmModel] = useState("");

  // Common
  const [llmSaving, setLlmSaving] = useState(false);
  const [llmStatus, setLlmStatus] = useState<
    "idle" | "saved" | "cleared" | "error"
  >("idle");
  const [llmError, setLlmError] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    setLlmLoading(true);
    try {
      const [configData, modelsData, realmData, liteLlmModelsData] =
        await Promise.all([
          agentsClient.getLlmConfig({ params: { did } }).then(unwrap),
          modelsClient.list().then(unwrap),
          agentsClient.getRealmLlm({ params: { did } }).then(unwrap),
          litellmClient.models().then(unwrap),
        ]);

      const cfg = (configData as { config: SafeLlmConfig | null }).config;
      setLlmConfig(cfg);
      setRegistryModels(modelsData.models);
      setRealmLlmData(realmData as RealmLlmData);
      const liteLlm = liteLlmModelsData as {
        models?: { name: string; params: Record<string, unknown> }[];
        configured?: boolean;
      };
      setLiteLlmModels(liteLlm.models ?? []);
      setLitellmConfigured(Boolean(liteLlm.configured));

      if (cfg) {
        setLlmForm({
          provider: cfg.provider,
          model: cfg.model,
          apiKey: "",
          baseUrl: cfg.baseUrl ?? "",
          systemPrompt: cfg.systemPrompt ?? "",
          maxTokens: cfg.maxTokens?.toString() ?? "",
        });
      }
    } catch {
      // swallow — individual pieces may not be available
    } finally {
      setLlmLoading(false);
    }
  }, [did]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ── Derived flags ─────────────────────────────────────────────────────────

  const hasRealmRouting = Boolean(
    realmLlmData?.litellmConfigured &&
    realmLlmData.realms.some((r) => r.hasVirtualKey && r.models.length > 0)
  );

  // The agent's LiteLLM virtual key is part of the agent record (returned by
  // GET /api/agents/:did) — derive the key info instead of refetching it.
  const agentKeyInfo: AgentKeyInfo = {
    configured: Boolean(agent.litellmVirtualKey),
    keyPrefix: agent.litellmVirtualKey
      ? agent.litellmVirtualKey.slice(0, 8)
      : null,
    allowedModels: Array.isArray(agent.litellmAllowedModels)
      ? (agent.litellmAllowedModels as string[])
      : [],
    dailyBudget: agent.litellmDailyBudget,
    updatedAt: agent.litellmKeyUpdatedAt
      ? new Date(agent.litellmKeyUpdatedAt).toISOString()
      : null,
    litellmConfigured,
  };

  /**
   * Active config mode:
   *  1. No manual config + agent key configured → agent-key
   *  2. Manual config that looks like realm routing → realm
   *  3. Manual config that matches registry model → registry
   *  4. Anything else with manual config → manual
   */
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

  /** True when the agent key is the effective config (no manual llmConfig overrides it). */
  const activeIsAgentKey = Boolean(agentKeyInfo?.configured && !llmConfig);

  // ── Edit flow ─────────────────────────────────────────────────────────────

  function openEdit() {
    setLlmError(null);

    if (activeIsAgentKey) {
      // Editing an existing agent key — check if it's a LiteLLM model
      const allowedModels = agentKeyInfo!.allowedModels;
      if (
        allowedModels.length === 1 &&
        liteLlmModels.some((m) => m.name === allowedModels[0])
      ) {
        // It's a single LiteLLM model
        setSelectedLiteLlmModel(allowedModels[0]);
        setSelectedSource("litellm");
        setConfigMode("model");
        setLlmEditing(true);
        return;
      }
      // Multi-model or custom agent key
      setKeyModels(allowedModels);
      setKeyBudget(agentKeyInfo!.dailyBudget?.toString() ?? "");
      setKeyModelInput("");
      setConfigMode("agent-key");
      setLlmEditing(true);
      return;
    }

    if (llmConfig?.provider === "openai-compatible") {
      if (activeRealmRoute) {
        setSelectedRealmId(activeRealmRoute.realm.realmId);
        setSelectedRealmModelId(activeRealmRoute.model.id);
        setConfigMode("realm");
        setLlmEditing(true);
        return;
      }
      if (activeRegistryModel) {
        setSelectedRegistryId(activeRegistryModel.id);
        setSelectedSource("registry");
        setConfigMode("model");
        setLlmEditing(true);
        return;
      }
      setConfigMode("manual");
    } else if (llmConfig) {
      setConfigMode("manual");
    } else {
      // No config at all — pick best default
      if (litellmConfigured) {
        setKeyModels([]);
        setKeyBudget("");
        setKeyModelInput("");
        setConfigMode("agent-key");
      } else if (hasRealmRouting) {
        const first = realmLlmData!.realms.find(
          (r) => r.hasVirtualKey && r.models.length > 0
        )!;
        setSelectedRealmId(first.realmId);
        setSelectedRealmModelId(first.models[0]?.id ?? "");
        setConfigMode("realm");
      } else if (liteLlmModels.length > 0) {
        setSelectedLiteLlmModel(liteLlmModels[0]?.name ?? "");
        setSelectedSource("litellm");
        setConfigMode("model");
      } else if (registryModels.length > 0) {
        setSelectedSource("registry");
        setConfigMode("model");
      } else {
        setConfigMode("manual");
      }
    }
    setLlmEditing(true);
  }

  // ── Save handlers ─────────────────────────────────────────────────────────

  async function clearConfig() {
    setLlmSaving(true);
    setLlmError(null);
    try {
      unwrap(await agentsClient.deleteLlmConfig({ params: { did } }));
      await loadAll();
      setLlmStatus("cleared");
      setTimeout(() => setLlmStatus("idle"), 2500);
    } catch {
      setLlmStatus("error");
    } finally {
      setLlmSaving(false);
    }
  }

  async function saveAgentKey() {
    setKeySaving(true);
    setLlmError(null);
    try {
      // 1. Clear any manual llmConfig so the agent key takes priority
      if (llmConfig)
        unwrap(await agentsClient.deleteLlmConfig({ params: { did } }));

      // 2. Provision / refresh the key
      const body: { allowedModels?: string[]; dailyBudget?: number } = {};
      if (keyModels.length > 0) body.allowedModels = keyModels;
      if (keyBudget) body.dailyBudget = parseFloat(keyBudget);

      unwrap(await agentsClient.putLitellmKey({ params: { did }, body }));

      // Refresh local config + the agent (the key lives on the agent record)
      await Promise.all([loadAll(), onChanged?.()]);
      setLlmEditing(false);
      setLlmStatus("saved");
      setTimeout(() => setLlmStatus("idle"), 2500);
    } catch (e) {
      setLlmError(e instanceof Error ? e.message : "Failed to provision key");
      setLlmStatus("error");
    } finally {
      setKeySaving(false);
    }
  }

  async function revokeAgentKey() {
    setRevoking(true);
    try {
      unwrap(await agentsClient.deleteLitellmKey({ params: { did } }));
      await Promise.all([loadAll(), onChanged?.()]);
      setShowRevokeConfirm(false);
      setLlmStatus("cleared");
      setTimeout(() => setLlmStatus("idle"), 2500);
    } finally {
      setRevoking(false);
    }
  }

  async function saveRealmRouting() {
    if (!selectedRealmId || !selectedRealmModelId) return;
    setLlmSaving(true);
    setLlmStatus("idle");
    setLlmError(null);
    try {
      const { config } = unwrap(
        await agentsClient.setLlmConfig({
          params: { did },
          body: {
            realmId: selectedRealmId,
            realmModelId: selectedRealmModelId,
          },
        })
      );
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
      const { config } = unwrap(
        await agentsClient.setLlmConfig({
          params: { did },
          body: { registryModelId: selectedRegistryId },
        })
      );
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

  async function saveLiteLlmModel() {
    if (!selectedLiteLlmModel) return;
    setLlmSaving(true);
    setLlmStatus("idle");
    setLlmError(null);
    try {
      // 1. Clear any manual llmConfig so the LiteLLM model takes priority
      if (llmConfig)
        unwrap(await agentsClient.deleteLlmConfig({ params: { did } }));

      // 2. Create agent key with the selected model
      unwrap(
        await agentsClient.putLitellmKey({
          params: { did },
          body: { allowedModels: [selectedLiteLlmModel] },
        })
      );

      await Promise.all([loadAll(), onChanged?.()]);
      setLlmEditing(false);
      setLlmStatus("saved");
      setTimeout(() => setLlmStatus("idle"), 2500);
    } catch (e) {
      setLlmError(
        e instanceof Error ? e.message : "Failed to set LiteLLM model"
      );
      setLlmStatus("error");
    } finally {
      setLlmSaving(false);
    }
  }

  async function saveSelectedModel() {
    if (selectedSource === "litellm") {
      return saveLiteLlmModel();
    }
    return saveRegistryModel();
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
      const { config } = unwrap(
        await agentsClient.setLlmConfig({ params: { did }, body })
      );
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

  // ── Render ────────────────────────────────────────────────────────────────

  const selectedProvider = PROVIDER_OPTIONS.find(
    (p) => p.value === llmForm.provider
  )!;

  if (llmLoading)
    return <p className="text-foreground-500 text-sm">Loading…</p>;

  const hasModels = liteLlmModels.length > 0 || registryModels.length > 0;

  // Mode selector buttons config
  const MODES: {
    id: ConfigMode;
    label: string;
    disabled: boolean;
    hint?: string;
  }[] = [
    {
      id: "agent-key",
      label: "Agent Key",
      disabled: !litellmConfigured,
      hint: "LiteLLM proxy not configured",
    },
    {
      id: "realm",
      label: "Realm Routing",
      disabled: !hasRealmRouting,
      hint: !realmLlmData?.litellmConfigured
        ? "LiteLLM not configured"
        : "no models in realm",
    },
    {
      id: "model",
      label: "Models",
      disabled: !hasModels,
      hint: "no models available",
    },
    { id: "manual", label: "Manual", disabled: false },
  ];

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
      <ConfirmModal
        open={showRevokeConfirm}
        title="Revoke agent key"
        message="The agent's LiteLLM virtual key will be removed. It will fall back to the realm key (or manual config if set)."
        confirmLabel="Revoke key"
        variant="danger"
        loading={revoking}
        onConfirm={revokeAgentKey}
        onCancel={() => setShowRevokeConfirm(false)}
      />
      {/* Reported LLM banner */}
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
              reported by agent
              {!llmConfig && !activeIsAgentKey ? " (local env config)" : ""}
            </span>
          </div>
        </div>
      )}
      {/* ── Main config card ── */}
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
              {/* Revoke agent key */}
              {activeIsAgentKey && (
                <button
                  onClick={() => setShowRevokeConfirm(true)}
                  className="text-xs text-danger-400 hover:text-danger-300 border border-danger-500/30 px-2.5 py-1.5 rounded-md transition-colors"
                >
                  Revoke key
                </button>
              )}
              {/* Clear manual config */}
              {llmConfig && !activeIsAgentKey && (
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
                {llmConfig || activeIsAgentKey ? "Edit" : "Configure"}
              </button>
            </div>
          )}
        </div>

        {/* ── Edit mode ── */}
        {llmEditing ? (
          <div className="p-4 space-y-4">
            {/* Mode selector */}
            <div className="flex rounded-lg border border-neutral-200 overflow-hidden text-sm">
              {MODES.map(({ id, label, disabled, hint }) => (
                <button
                  key={id}
                  onClick={() => !disabled && setConfigMode(id)}
                  disabled={disabled}
                  title={disabled ? hint : undefined}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    configMode === id
                      ? "bg-primary-600 text-white"
                      : disabled
                        ? "bg-background text-foreground-400 cursor-not-allowed"
                        : "bg-background text-foreground-500 hover:text-foreground hover:bg-background-200"
                  }`}
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

            {/* ── Agent Key mode ── */}
            {configMode === "agent-key" && (
              <div className="space-y-4">
                <p className="text-xs text-foreground-500">
                  Provision a virtual key scoped to this agent in the LiteLLM
                  proxy. Any existing manual config will be cleared — the agent
                  key becomes the effective LLM config.
                </p>

                {/* Model tags */}
                <div>
                  <label className="text-xs text-foreground-500 uppercase tracking-wider font-medium block mb-1.5">
                    Allowed models{" "}
                    <span className="normal-case text-foreground-400">
                      (empty = inherit from realm)
                    </span>
                  </label>
                  {keyModels.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {keyModels.map((m) => (
                        <span
                          key={m}
                          className="flex items-center gap-1 text-xs bg-primary-100 text-primary-700 border border-primary-300 rounded-full px-2.5 py-0.5"
                        >
                          <code className="font-mono">{m}</code>
                          <button
                            type="button"
                            onClick={() =>
                              setKeyModels((prev) =>
                                prev.filter((x) => x !== m)
                              )
                            }
                            className="ml-0.5 hover:text-primary-500 leading-none"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={keyModelInput}
                      onChange={(e) => setKeyModelInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const m = keyModelInput.trim();
                          if (m && !keyModels.includes(m))
                            setKeyModels((p) => [...p, m]);
                          setKeyModelInput("");
                        }
                      }}
                      placeholder="gpt-4o  or  claude-sonnet-4-5"
                      className="flex-1 bg-background-200 border border-neutral-300 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground-400 font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const m = keyModelInput.trim();
                        if (m && !keyModels.includes(m))
                          setKeyModels((p) => [...p, m]);
                        setKeyModelInput("");
                      }}
                      disabled={!keyModelInput.trim()}
                      className="px-3 py-2 text-sm font-medium rounded-lg border border-neutral-300 hover:bg-background-200 transition-colors disabled:opacity-40"
                    >
                      Add
                    </button>
                  </div>
                </div>

                {/* Budget */}
                <div>
                  <label className="text-xs text-foreground-500 uppercase tracking-wider font-medium block mb-1.5">
                    Daily budget (USD){" "}
                    <span className="normal-case text-foreground-400">
                      (optional)
                    </span>
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-foreground-500">$</span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={keyBudget}
                      onChange={(e) => setKeyBudget(e.target.value)}
                      placeholder="2.50"
                      className="w-32 bg-background-200 border border-neutral-300 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                    />
                    <span className="text-xs text-foreground-400">/ day</span>
                  </div>
                </div>

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
                    onClick={saveAgentKey}
                    disabled={keySaving}
                    className="flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-40 transition"
                  >
                    {keySaving ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />{" "}
                        Provisioning…
                      </>
                    ) : agentKeyInfo?.configured ? (
                      "Refresh Key"
                    ) : (
                      "Provision Key & Push to Agent"
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* ── Realm Routing mode ── */}
            {configMode === "realm" && (
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
            )}

            {/* ── Unified model picker ── */}
            {configMode === "model" && (
              <div className="space-y-3">
                {/* Flat unified model list — LiteLLM first, then registry */}
                {(liteLlmModels.length > 0 ||
                  registryModels.filter((m) => m.status === "active").length >
                    0) && (
                  <div className="space-y-1.5">
                    {liteLlmModels.map((m) => (
                      <label
                        key={`litellm:${m.name}`}
                        className={`flex items-center gap-3 px-3 py-3 rounded-xl border cursor-pointer transition-colors ${
                          selectedSource === "litellm" &&
                          selectedLiteLlmModel === m.name
                            ? "border-primary-500 bg-primary-50"
                            : "border-neutral-200 hover:border-neutral-300 hover:bg-background-200/50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="unified-model"
                          checked={
                            selectedSource === "litellm" &&
                            selectedLiteLlmModel === m.name
                          }
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
                          {typeof m.params === "object" &&
                            m.params &&
                            Object.keys(m.params).length > 0 && (
                              <code className="text-xs text-foreground-400 font-mono truncate block">
                                {Object.entries(m.params)
                                  .slice(0, 2)
                                  .map(
                                    ([k, v]) =>
                                      `${k}: ${String(v).substring(0, 30)}`
                                  )
                                  .join(" · ")}
                              </code>
                            )}
                        </div>
                      </label>
                    ))}
                    {registryModels
                      .filter((m) => m.status === "active")
                      .map((m) => (
                        <label
                          key={`registry:${m.id}`}
                          className={`flex items-center gap-3 px-3 py-3 rounded-xl border cursor-pointer transition-colors ${
                            selectedSource === "registry" &&
                            selectedRegistryId === m.id
                              ? "border-primary-500 bg-primary-50"
                              : "border-neutral-200 hover:border-neutral-300 hover:bg-background-200/50"
                          }`}
                        >
                          <input
                            type="radio"
                            name="unified-model"
                            checked={
                              selectedSource === "registry" &&
                              selectedRegistryId === m.id
                            }
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
                    disabled={
                      (selectedSource === "litellm" && !selectedLiteLlmModel) ||
                      (selectedSource === "registry" && !selectedRegistryId) ||
                      llmSaving
                    }
                    onClick={saveSelectedModel}
                    className="px-4 py-1.5 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-40 transition"
                  >
                    {llmSaving ? "Saving…" : "Use this model"}
                  </button>
                  <a
                    href="/models"
                    className="text-xs text-foreground-500 hover:text-foreground ml-auto transition-colors"
                  >
                    Manage models →
                  </a>
                </div>
              </div>
            )}

            {/* ── Manual mode ── */}
            {configMode === "manual" && (
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
                          setLlmForm((f) => ({ ...f, baseUrl: e.target.value }))
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
                        setLlmForm((f) => ({ ...f, maxTokens: e.target.value }))
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
        ) : /* ── View mode ── */ activeIsAgentKey ? (
          /* Agent key display */
          <div className="divide-y divide-neutral-200">
            <div className="flex items-center gap-3 px-4 py-3 bg-warning-50">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-warning-100 text-warning-700 border border-warning-300 shrink-0 flex items-center gap-1">
                <Key className="w-3 h-3" /> Agent Key
              </span>
              <span className="text-sm text-foreground font-mono">
                {agentKeyInfo!.keyPrefix}…
              </span>
              <Link
                href="/models?tab=litellm"
                className="ml-auto text-xs text-warning-600 hover:underline shrink-0"
              >
                LiteLLM proxy →
              </Link>
            </div>
            {[
              {
                label: "Models",
                value:
                  agentKeyInfo!.allowedModels.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {agentKeyInfo!.allowedModels.map((m) => (
                        <code
                          key={m}
                          className="text-xs font-mono bg-background-200 px-1.5 py-0.5 rounded border border-neutral-200"
                        >
                          {m}
                        </code>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-foreground-400">
                      inherited from realm
                    </span>
                  ),
              },
              {
                label: "Daily budget",
                value:
                  agentKeyInfo!.dailyBudget != null ? (
                    <span className="text-xs font-medium">
                      ${agentKeyInfo!.dailyBudget.toFixed(2)} / day
                    </span>
                  ) : (
                    <span className="text-xs text-foreground-400">
                      No limit
                    </span>
                  ),
              },
              {
                label: "Updated",
                value: agentKeyInfo!.updatedAt ? (
                  <span className="text-xs text-foreground-500">
                    {new Date(agentKeyInfo!.updatedAt).toLocaleString()}
                  </span>
                ) : (
                  <span className="text-xs text-foreground-400">—</span>
                ),
              },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-start gap-4 px-4 py-3">
                <div className="w-28 flex-shrink-0 text-xs text-foreground-500 uppercase pt-0.5">
                  {label}
                </div>
                <div className="flex-1 text-sm text-foreground">{value}</div>
              </div>
            ))}
          </div>
        ) : llmConfig ? (
          /* Manual / realm / registry config display */
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
          /* No config */
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
            {litellmConfigured && (
              <p className="text-xs text-foreground-500 mt-2">
                LiteLLM is configured — click Configure to provision an agent
                key.
              </p>
            )}
            {!litellmConfigured && hasRealmRouting && (
              <p className="text-xs text-foreground-500 mt-2">
                Realm routing is available — click Configure to route via your
                LiteLLM proxy.
              </p>
            )}
            {!litellmConfigured &&
              !hasRealmRouting &&
              registryModels.length > 0 && (
                <p className="text-xs text-foreground-500 mt-2">
                  {registryModels.length} model
                  {registryModels.length !== 1 ? "s" : ""} available in the
                  registry — click Configure to assign one.
                </p>
              )}
          </div>
        )}
      </div>
      {/* Status feedback */}
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
