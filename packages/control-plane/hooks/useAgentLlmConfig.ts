"use client";

import { useCallback, useEffect, useState } from "react";
import { type LlmProviderType } from "@vaultysclaw/shared";
import {
  agentsClient,
  litellmClient,
  modelsClient,
  unwrap,
} from "@/lib/api/ts-rest/client";
import { SafeLlmConfig, SafeModel, type AgentInfo } from "@/lib/contracts";
import { RealmLlmData } from "@/types/api/responses";
import {
  type AgentKeyInfo,
  type ConfigMode,
  type ModelSource,
} from "@/components/agent/config/constants";

export interface LlmForm {
  provider: LlmProviderType;
  model: string;
  apiKey: string;
  baseUrl: string;
  systemPrompt: string;
  maxTokens: string;
}

export interface LiteLlmModelOption {
  name: string;
  params: Record<string, unknown>;
}

type LlmStatus = "idle" | "saved" | "cleared" | "error";

const STATUS_RESET_MS = 2500;

/**
 * All state + server interactions for an agent's LLM configuration: the manual
 * config, realm routing, registry / LiteLLM model selection and the agent's
 * own virtual key. The ConfigTab component is left purely presentational.
 */
export function useAgentLlmConfig(
  agent: AgentInfo,
  onChanged?: () => void | Promise<void>
) {
  const did = agent.did;

  // Manual / stored config
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
  const [llmForm, setLlmForm] = useState<LlmForm>({
    provider: "openai",
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
  const [liteLlmModels, setLiteLlmModels] = useState<LiteLlmModelOption[]>([]);
  const [selectedLiteLlmModel, setSelectedLiteLlmModel] = useState("");

  // Common
  const [llmSaving, setLlmSaving] = useState(false);
  const [llmStatus, setLlmStatus] = useState<LlmStatus>("idle");
  const [llmError, setLlmError] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const flashStatus = useCallback((status: Exclude<LlmStatus, "idle">) => {
    setLlmStatus(status);
    if (status !== "error")
      setTimeout(() => setLlmStatus("idle"), STATUS_RESET_MS);
  }, []);

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
        models?: LiteLlmModelOption[];
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

  // ── Derived flags ───────────────────────────────────────────────────────

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

  const activeRegistryModel =
    llmConfig?.provider === "openai-compatible"
      ? (registryModels.find((m) => m.modelId === llmConfig.model) ?? null)
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

  /** True when the agent key is the effective config (no manual override). */
  const activeIsAgentKey = Boolean(agentKeyInfo.configured && !llmConfig);

  // ── Edit flow ───────────────────────────────────────────────────────────

  /**
   * Active config mode resolution when opening the editor:
   *  1. No manual config + agent key configured → agent-key (or model if single LiteLLM model)
   *  2. Manual config that looks like realm routing → realm
   *  3. Manual config that matches a registry model → model
   *  4. Anything else with manual config → manual
   */
  const openEdit = useCallback(() => {
    setLlmError(null);

    if (activeIsAgentKey) {
      const allowedModels = agentKeyInfo.allowedModels;
      if (
        allowedModels.length === 1 &&
        liteLlmModels.some((m) => m.name === allowedModels[0])
      ) {
        setSelectedLiteLlmModel(allowedModels[0]);
        setSelectedSource("litellm");
        setConfigMode("model");
        setLlmEditing(true);
        return;
      }
      setKeyModels(allowedModels);
      setKeyBudget(agentKeyInfo.dailyBudget?.toString() ?? "");
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
    } else if (litellmConfigured) {
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
    setLlmEditing(true);
  }, [
    activeIsAgentKey,
    agentKeyInfo,
    liteLlmModels,
    llmConfig,
    activeRealmRoute,
    activeRegistryModel,
    litellmConfigured,
    hasRealmRouting,
    realmLlmData,
    registryModels.length,
  ]);

  const cancelEdit = useCallback(() => {
    setLlmEditing(false);
    setLlmStatus("idle");
  }, []);

  // ── Save handlers ─────────────────────────────────────────────────────────

  async function clearConfig() {
    setLlmSaving(true);
    setLlmError(null);
    try {
      unwrap(await agentsClient.deleteLlmConfig({ params: { did } }));
      await loadAll();
      flashStatus("cleared");
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

      await Promise.all([loadAll(), onChanged?.()]);
      setLlmEditing(false);
      flashStatus("saved");
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
      flashStatus("cleared");
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
          body: { realmId: selectedRealmId, realmModelId: selectedRealmModelId },
        })
      );
      setLlmConfig(config);
      setLlmEditing(false);
      flashStatus("saved");
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
      flashStatus("saved");
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
      flashStatus("saved");
    } catch (e) {
      setLlmError(e instanceof Error ? e.message : "Failed to set LiteLLM model");
      setLlmStatus("error");
    } finally {
      setLlmSaving(false);
    }
  }

  async function saveSelectedModel() {
    if (selectedSource === "litellm") return saveLiteLlmModel();
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
      flashStatus("saved");
    } catch {
      setLlmStatus("error");
    } finally {
      setLlmSaving(false);
    }
  }

  return {
    // status / loading
    llmLoading,
    llmEditing,
    llmSaving,
    keySaving,
    revoking,
    llmStatus,
    llmError,
    // confirm modals
    showClearConfirm,
    setShowClearConfirm,
    showRevokeConfirm,
    setShowRevokeConfirm,
    // config + derived
    llmConfig,
    configMode,
    setConfigMode,
    litellmConfigured,
    hasRealmRouting,
    agentKeyInfo,
    activeRegistryModel,
    activeRealmRoute,
    activeIsAgentKey,
    // data
    registryModels,
    realmLlmData,
    liteLlmModels,
    // realm selection
    selectedRealmId,
    setSelectedRealmId,
    selectedRealmModelId,
    setSelectedRealmModelId,
    // unified model selection
    selectedSource,
    setSelectedSource,
    selectedRegistryId,
    setSelectedRegistryId,
    selectedLiteLlmModel,
    setSelectedLiteLlmModel,
    // agent-key form
    keyModels,
    setKeyModels,
    keyModelInput,
    setKeyModelInput,
    keyBudget,
    setKeyBudget,
    // manual form
    llmForm,
    setLlmForm,
    // actions
    openEdit,
    cancelEdit,
    clearConfig,
    saveAgentKey,
    revokeAgentKey,
    saveRealmRouting,
    saveSelectedModel,
    saveManualConfig,
  };
}

export type AgentLlmConfigController = ReturnType<typeof useAgentLlmConfig>;
