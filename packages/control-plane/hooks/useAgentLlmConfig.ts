"use client";

import { useCallback, useEffect, useState } from "react";
import { type LlmProviderType } from "@vaultysclaw/shared";
import {
  adminApi,
  unwrap,
} from "@/lib/api/ts-rest/client";
import { SafeLlmConfig, SafeModel, type AgentInfo } from "@/lib/contracts";
import { WorkspaceLlmData } from "@/types/api/responses";
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
  /** claude-agent-sdk only. */
  cwd: string;
  /** claude-agent-sdk only, comma-separated in the UI. */
  allowedTools: string;
}

export interface LiteLlmModelOption {
  name: string;
  params: Record<string, unknown>;
}

type LlmStatus = "idle" | "saved" | "cleared" | "error";

const STATUS_RESET_MS = 2500;

/**
 * All state + server interactions for an agent's LLM configuration: the manual
 * config, workspace routing, registry / LiteLLM model selection and the agent's
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
  const [configMode, setConfigMode] = useState<ConfigMode>("workspace");

  // Registry / workspace routing helpers
  const [registryModels, setRegistryModels] = useState<SafeModel[]>([]);
  const [selectedRegistryId, setSelectedRegistryId] = useState("");
  const [workspaceLlmData, setWorkspaceLlmData] = useState<WorkspaceLlmData | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [selectedWorkspaceModelId, setSelectedWorkspaceModelId] = useState("");

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
    cwd: "",
    allowedTools: "",
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

  // Claude models (dynamic, via the agent's own supportedModels() query) —
  // used to populate the Model combobox for the claude-agent-sdk provider.
  const [claudeModels, setClaudeModels] = useState<string[]>([]);
  const [claudeModelsLoading, setClaudeModelsLoading] = useState(false);

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
      const [configData, modelsData, workspaceData, liteLlmModelsData] =
        await Promise.all([
          adminApi.agents.getLlmConfig({ params: { did } }).then(unwrap),
          adminApi.models.list().then(unwrap),
          adminApi.agents.getWorkspaceLlm({ params: { did } }).then(unwrap),
          adminApi.litellm.models().then(unwrap),
        ]);

      const cfg = (configData as { config: SafeLlmConfig | null }).config;
      setLlmConfig(cfg);
      setRegistryModels(modelsData.models);
      setWorkspaceLlmData(workspaceData as WorkspaceLlmData);
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
          cwd: cfg.cwd ?? "",
          allowedTools: cfg.allowedTools?.join(", ") ?? "",
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

  const hasWorkspaceRouting = Boolean(
    workspaceLlmData?.litellmConfigured &&
      workspaceLlmData.workspaces.some((r) => r.hasVirtualKey && r.models.length > 0)
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

  const activeWorkspaceRoute =
    llmConfig?.provider === "openai-compatible"
      ? (() => {
          for (const workspace of workspaceLlmData?.workspaces ?? []) {
            const model = workspace.models.find(
              (m) => m.litellmModelName === llmConfig.model
            );
            if (model) return { workspace, model };
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
   *  2. Manual config that looks like workspace routing → workspace
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
      if (activeWorkspaceRoute) {
        setSelectedWorkspaceId(activeWorkspaceRoute.workspace.workspaceId);
        setSelectedWorkspaceModelId(activeWorkspaceRoute.model.id);
        setConfigMode("workspace");
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
    } else if (hasWorkspaceRouting) {
      const first = workspaceLlmData!.workspaces.find(
        (r) => r.hasVirtualKey && r.models.length > 0
      )!;
      setSelectedWorkspaceId(first.workspaceId);
      setSelectedWorkspaceModelId(first.models[0]?.id ?? "");
      setConfigMode("workspace");
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
    activeWorkspaceRoute,
    activeRegistryModel,
    litellmConfigured,
    hasWorkspaceRouting,
    workspaceLlmData,
    registryModels.length,
  ]);

  const cancelEdit = useCallback(() => {
    setLlmEditing(false);
    setLlmStatus("idle");
  }, []);

  /**
   * Fetch the live list of Claude models via the connected agent's own
   * `supportedModels()` query (see /api/agents/:did/claude-models). Best
   * effort: on any failure (agent offline, bad/missing key, SDK error) this
   * just leaves `claudeModels` empty so callers fall back to the static list.
   */
  const fetchClaudeModels = useCallback(async () => {
    setClaudeModelsLoading(true);
    try {
      const qs = llmForm.apiKey
        ? `?apiKey=${encodeURIComponent(llmForm.apiKey)}`
        : "";
      const res = await fetch(`/api/agents/${did}/claude-models${qs}`);
      if (!res.ok) {
        setClaudeModels([]);
        return;
      }
      const data = (await res.json()) as {
        models?: { value: string }[];
      };
      setClaudeModels((data.models ?? []).map((m) => m.value));
    } catch {
      setClaudeModels([]);
    } finally {
      setClaudeModelsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [did, llmForm.apiKey]);

  // Fetch (once per edit session) as soon as the manual form targets
  // claude-agent-sdk — cheap best-effort call, ignored on failure.
  useEffect(() => {
    if (llmEditing && llmForm.provider === "claude-agent-sdk") {
      fetchClaudeModels();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [llmEditing, llmForm.provider]);

  // ── Save handlers ─────────────────────────────────────────────────────────

  async function clearConfig() {
    setLlmSaving(true);
    setLlmError(null);
    try {
      unwrap(await adminApi.agents.deleteLlmConfig({ params: { did } }));
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
        unwrap(await adminApi.agents.deleteLlmConfig({ params: { did } }));

      // 2. Provision / refresh the key
      const body: { allowedModels?: string[]; dailyBudget?: number } = {};
      if (keyModels.length > 0) body.allowedModels = keyModels;
      if (keyBudget) body.dailyBudget = parseFloat(keyBudget);

      unwrap(await adminApi.agents.putLitellmKey({ params: { did }, body }));

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
      unwrap(await adminApi.agents.deleteLitellmKey({ params: { did } }));
      await Promise.all([loadAll(), onChanged?.()]);
      setShowRevokeConfirm(false);
      flashStatus("cleared");
    } finally {
      setRevoking(false);
    }
  }

  async function saveWorkspaceRouting() {
    if (!selectedWorkspaceId || !selectedWorkspaceModelId) return;
    setLlmSaving(true);
    setLlmStatus("idle");
    setLlmError(null);
    try {
      const { config } = unwrap(
        await adminApi.agents.setLlmConfig({
          params: { did },
          body: { workspaceId: selectedWorkspaceId, workspaceModelId: selectedWorkspaceModelId },
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
        await adminApi.agents.setLlmConfig({
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
        unwrap(await adminApi.agents.deleteLlmConfig({ params: { did } }));

      // 2. Create agent key with the selected model
      unwrap(
        await adminApi.agents.putLitellmKey({
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
      if (llmForm.cwd) body.cwd = llmForm.cwd;
      if (llmForm.allowedTools) {
        body.allowedTools = llmForm.allowedTools
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
      }
      const { config } = unwrap(
        await adminApi.agents.setLlmConfig({ params: { did }, body })
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
    hasWorkspaceRouting,
    agentKeyInfo,
    activeRegistryModel,
    activeWorkspaceRoute,
    activeIsAgentKey,
    // data
    registryModels,
    workspaceLlmData,
    liteLlmModels,
    claudeModels,
    claudeModelsLoading,
    fetchClaudeModels,
    // workspace selection
    selectedWorkspaceId,
    setSelectedWorkspaceId,
    selectedWorkspaceModelId,
    setSelectedWorkspaceModelId,
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
    saveWorkspaceRouting,
    saveSelectedModel,
    saveManualConfig,
  };
}

export type AgentLlmConfigController = ReturnType<typeof useAgentLlmConfig>;
