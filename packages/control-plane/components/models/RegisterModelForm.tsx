"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Check,
  Cpu,
  RefreshCw,
  CheckCircle2,
  XCircle,
  X,
  Radar,
  Plus,
} from "lucide-react";
import { ApiError, adminApi, unwrap } from "@/lib/api/ts-rest/client";
import type { SafeModel } from "@/lib/contracts";
import { isSdkAgentProvider, type LlmProviderType } from "@vaultysclaw/shared";
import { useConfirm } from "@/components/shared/ConfirmContext";
import {
  discoverLocalModels,
  type LocalDiscoveryResult,
  type LocalServer,
} from "./local-discovery";

const PROVIDERS: {
  value: LlmProviderType;
  label: string;
  defaults: { baseUrl: string; modelId: string };
}[] = [
  {
    value: "openai-compatible",
    label: "OpenAI-compatible / vLLM",
    defaults: {
      baseUrl: "http://localhost:8000",
      modelId: "meta-llama/Llama-3-8B-Instruct",
    },
  },
  {
    value: "openai",
    label: "OpenAI",
    defaults: { baseUrl: "https://api.openai.com/v1", modelId: "gpt-4o-mini" },
  },
  {
    value: "anthropic",
    label: "Anthropic",
    defaults: {
      baseUrl: "https://api.anthropic.com",
      modelId: "claude-opus-4-7",
    },
  },
  {
    value: "google",
    label: "Google",
    defaults: {
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      modelId: "gemini-2.0-flash",
    },
  },
  {
    value: "ollama",
    label: "Ollama",
    defaults: { baseUrl: "http://localhost:11434", modelId: "llama2" },
  },
  // SDK-agent providers wrap a vendor's own agent harness (own tool loop,
  // permissions, sessions) via Mastra SDK Agents, run locally by the agent
  // controller — there is no network endpoint, so baseUrl is unused.
  {
    value: "claude-agent-sdk",
    label: "Claude Agent SDK (experimental)",
    defaults: { baseUrl: "", modelId: "claude-sonnet-5" },
  },
  {
    value: "cursor-agent-sdk",
    label: "Cursor Agent SDK (experimental)",
    defaults: { baseUrl: "", modelId: "cursor-default" },
  },
  {
    value: "openai-agent-sdk",
    label: "OpenAI Agents SDK (experimental)",
    defaults: { baseUrl: "", modelId: "gpt-4o" },
  },
];

type ExistingModel = SafeModel;

interface RegisterModelFormProps {
  /** Called after a model is successfully registered */
  onAdded?: (name: string) => void;
  /** Called when the user is done (for modal/inline cancel) */
  onClose?: () => void;
  /** Whether to show the description field */
  showDescription?: boolean;
  /** Whether to load and show already-registered models above the form */
  showExistingModels?: boolean;
  /** Layout: "grid" (2-col) or "stack" (1-col) */
  layout?: "grid" | "stack";
}

export function RegisterModelForm({
  onAdded,
  onClose,
  showDescription = false,
  showExistingModels = false,
  layout = "grid",
}: RegisterModelFormProps) {
  const confirm = useConfirm();
  // Existing models list
  const [existingModels, setExistingModels] = useState<ExistingModel[]>([]);
  const [existingLoading, setExistingLoading] = useState(false);
  const [testResults, setTestResults] = useState<
    Record<string, { ok: boolean; error?: string } | "testing">
  >({});

  // Form fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [provider, setProvider] =
    useState<LlmProviderType>("openai-compatible");
  const isSdkAgent = isSdkAgentProvider(provider);
  const [modelId, setModelId] = useState(PROVIDERS[0].defaults.modelId);
  const [baseUrl, setBaseUrl] = useState(PROVIDERS[0].defaults.baseUrl);
  const [apiKey, setApiKey] = useState("");
  // Form state
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [formMsg, setFormMsg] = useState<{ ok: boolean; text: string } | null>(
    null
  );
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [showModelList, setShowModelList] = useState(false);
  // Local-server discovery (browser-side scan)
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<LocalDiscoveryResult[] | null>(
    null
  );
  const [quickAdding, setQuickAdding] = useState<string | null>(null);

  const loadExisting = useCallback(async () => {
    if (!showExistingModels) return;
    setExistingLoading(true);
    try {
      const { models } = unwrap(await adminApi.models.list());
      setExistingModels(models);
    } finally {
      setExistingLoading(false);
    }
  }, [showExistingModels]);

  useEffect(() => {
    loadExisting();
  }, [loadExisting]);

  const handleProviderChange = (newProvider: LlmProviderType) => {
    setProvider(newProvider);
    const p = PROVIDERS.find((p) => p.value === newProvider);
    if (p) {
      setBaseUrl(p.defaults.baseUrl);
      setModelId(p.defaults.modelId);
    }
    setAvailableModels([]);
    setShowModelList(false);
    setFormMsg(null);
  };

  const testConnection = async () => {
    if (isSdkAgent) return; // No network endpoint to test — local vendor harness.
    if (!baseUrl.trim()) {
      setFormMsg({ ok: false, text: "Base URL is required" });
      return;
    }
    setTesting(true);
    setFormMsg(null);
    setAvailableModels([]);
    setShowModelList(false);
    try {
      const data = unwrap(
        await adminApi.models.test({
          body: { provider, modelId, baseUrl, apiKey: apiKey || undefined },
        })
      );
      if (data.ok) {
        if (data.models.length > 0) {
          setAvailableModels(data.models);
          setShowModelList(true);
          setFormMsg({
            ok: true,
            text: `Connection successful — ${data.models.length} model${data.models.length !== 1 ? "s" : ""} found`,
          });
        } else {
          setFormMsg({ ok: true, text: "Connection successful" });
          setTimeout(() => setFormMsg(null), 2500);
        }
      } else {
        setFormMsg({ ok: false, text: data.error ?? "Connection failed" });
      }
    } catch {
      setFormMsg({ ok: false, text: "Network error" });
    } finally {
      setTesting(false);
    }
  };

  /** Shared registration path used by both the manual form and quick-add. */
  const registerModel = async (fields: {
    name: string;
    description?: string;
    provider: LlmProviderType;
    modelId: string;
    baseUrl?: string;
    apiKey?: string;
  }): Promise<boolean> => {
    const sdk = isSdkAgentProvider(fields.provider);
    unwrap(
      await adminApi.models.create({
        body: {
          name: fields.name,
          description: fields.description || undefined,
          provider: fields.provider,
          modelId: fields.modelId,
          baseUrl: sdk ? undefined : fields.baseUrl,
          apiKey: fields.apiKey || undefined,
          // SDK-agent providers run locally via the agent controller — never
          // route them through the LiteLLM OpenAI-compatible proxy.
          skipLiteLLM: sdk || undefined,
        },
      })
    );
    onAdded?.(fields.name);
    await loadExisting();
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormMsg({ ok: false, text: "Name is required" });
      return;
    }
    if (!modelId.trim()) {
      setFormMsg({ ok: false, text: "Model ID is required" });
      return;
    }
    if (!isSdkAgent && !baseUrl.trim()) {
      setFormMsg({ ok: false, text: "Base URL is required" });
      return;
    }

    setSaving(true);
    setFormMsg(null);
    try {
      const registeredName = name.trim();
      await registerModel({
        name: registeredName,
        description: description.trim(),
        provider,
        modelId: modelId.trim(),
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
      });
      setName("");
      setDescription("");
      setApiKey("");
      setAvailableModels([]);
      setShowModelList(false);
      setFormMsg({ ok: true, text: `"${registeredName}" registered` });
      setTimeout(() => setFormMsg(null), 2500);
    } catch (err) {
      setFormMsg({
        ok: false,
        text: err instanceof ApiError ? err.message : "Network error",
      });
    } finally {
      setSaving(false);
    }
  };

  const scanLocal = async () => {
    setScanning(true);
    setFormMsg(null);
    try {
      const results = await discoverLocalModels();
      setScanResults(results);
      const found = results.filter((r) => r.reachable).length;
      if (found === 0) {
        setFormMsg({
          ok: false,
          text: "No local servers detected (check they are running / CORS is enabled)",
        });
      }
    } finally {
      setScanning(false);
    }
  };

  /** Fill the form from a discovered model so the admin can review before saving. */
  const prefillFrom = (server: LocalServer, model: string) => {
    setProvider(server.provider);
    setBaseUrl(server.baseUrl);
    setModelId(model);
    if (!name.trim()) setName(model);
    setAvailableModels([]);
    setShowModelList(false);
    setFormMsg(null);
  };

  /** Register a discovered model immediately (name defaults to its id). */
  const quickAdd = async (server: LocalServer, model: string) => {
    const key = `${server.id}:${model}`;
    setQuickAdding(key);
    setFormMsg(null);
    try {
      await registerModel({
        name: model,
        provider: server.provider,
        modelId: model,
        baseUrl: server.baseUrl,
      });
      setFormMsg({ ok: true, text: `"${model}" registered` });
      setTimeout(() => setFormMsg(null), 2500);
    } catch (err) {
      setFormMsg({
        ok: false,
        text: err instanceof ApiError ? err.message : "Network error",
      });
    } finally {
      setQuickAdding(null);
    }
  };

  const testExisting = async (id: string) => {
    setTestResults((r) => ({ ...r, [id]: "testing" }));
    try {
      const data = unwrap(await adminApi.models.validate({ params: { id } }));
      setTestResults((r) => ({ ...r, [id]: data }));
    } catch {
      setTestResults((r) => ({
        ...r,
        [id]: { ok: false, error: "Network error" },
      }));
    }
  };

  const deleteExisting = async (id: string) => {
    if (
      !(await confirm({
        title: "Remove model",
        message: "Remove this model?",
        variant: "danger",
      }))
    )
      return;
    unwrap(await adminApi.models.remove({ params: { id } }));
    await loadExisting();
  };

  const inputCls =
    "w-full bg-background-200 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/50 disabled:opacity-50";

  return (
    <div className="space-y-4">
      {/* Existing models list */}
      {showExistingModels && (
        <div className="space-y-2">
          {existingLoading ? (
            <div className="flex items-center justify-center py-4">
              <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : existingModels.length > 0 ? (
            existingModels.map((m) => {
              const result = testResults[m.id];
              const isTesting = result === "testing";
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-3 px-4 py-3 bg-background-200 border border-neutral-200 rounded-xl"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {m.name}
                    </p>
                    <code className="text-xs text-foreground-500 font-mono truncate block">
                      {m.modelId}
                    </code>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${
                      m.provider === "openai"
                        ? "bg-success-100 text-success-700 border-success-300"
                        : m.provider === "openai-compatible"
                          ? "bg-primary-100 text-primary-700 border-primary-300"
                          : m.provider === "anthropic"
                            ? "bg-warning-100 text-warning-700 border-warning-300"
                            : m.provider === "google"
                              ? "bg-warning-100 text-warning-700 border-warning-300"
                              : "bg-secondary-100 text-secondary-700 border-secondary-300"
                    }`}
                  >
                    {m.provider}
                  </span>
                  {result !== undefined &&
                    result !== "testing" &&
                    (result.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-success-500 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-danger-500 shrink-0" />
                    ))}
                  <button
                    onClick={() => testExisting(m.id)}
                    disabled={isTesting}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-neutral-200 text-foreground-500 hover:text-foreground hover:bg-background-100 transition-colors disabled:opacity-50 shrink-0"
                  >
                    {isTesting ? (
                      <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                    Test
                  </button>
                  <button
                    onClick={() => deleteExisting(m.id)}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-neutral-200 text-danger-500/60 hover:text-danger-600 hover:bg-danger-500/5 hover:border-danger-500/30 transition-colors shrink-0"
                  >
                    <X className="w-3 h-3" />
                    Remove
                  </button>
                </div>
              );
            })
          ) : (
            <div className="rounded-xl border border-neutral-200 border-dashed bg-background-200/40 py-5 text-center">
              <Cpu className="w-6 h-6 text-foreground-400 mx-auto mb-1" />
              <p className="text-sm text-foreground-500">
                No models registered yet
              </p>
            </div>
          )}
        </div>
      )}

      {/* Local model discovery (browser-side scan) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-foreground">Local models</p>
            <p className="text-xs text-foreground-500">
              Scan this machine for running LLM servers (LM Studio, Ollama,
              vLLM)
            </p>
          </div>
          <button
            type="button"
            onClick={scanLocal}
            disabled={scanning}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-neutral-200 text-foreground-500 hover:text-foreground hover:bg-background-200 rounded-xl disabled:opacity-40 transition-colors shrink-0"
          >
            {scanning ? (
              <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <Radar className="w-3.5 h-3.5" />
            )}
            {scanning ? "Scanning…" : "Scan local models"}
          </button>
        </div>

        {scanResults && (
          <div className="space-y-2">
            {scanResults.map((r) => (
              <div
                key={r.server.id}
                className="rounded-xl border border-neutral-200 bg-background-200/60 p-3"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      r.reachable ? "bg-success-500" : "bg-neutral-300"
                    }`}
                  />
                  <span className="text-sm font-medium text-foreground">
                    {r.server.label}
                  </span>
                  <code className="text-xs text-foreground-400 font-mono truncate">
                    {r.server.baseUrl}
                  </code>
                  {!r.reachable && (
                    <span className="ml-auto text-xs text-foreground-400 truncate">
                      {r.error ?? "Not detected"}
                    </span>
                  )}
                </div>

                {r.reachable && r.models.length === 0 && (
                  <p className="text-xs text-foreground-500">
                    Reachable, but no models loaded.
                  </p>
                )}

                {r.reachable && r.models.length > 0 && (
                  <div className="space-y-1">
                    {r.models.map((m) => {
                      const key = `${r.server.id}:${m}`;
                      const isAdding = quickAdding === key;
                      return (
                        <div
                          key={m}
                          className="flex items-center gap-2 bg-background-100 border border-neutral-200 rounded-lg px-3 py-1.5"
                        >
                          <button
                            type="button"
                            onClick={() => prefillFrom(r.server, m)}
                            className="flex-1 min-w-0 text-left text-xs font-mono text-foreground truncate hover:text-primary-600 transition-colors"
                            title={`Use "${m}" in the form below`}
                          >
                            {m}
                          </button>
                          <button
                            type="button"
                            onClick={() => quickAdd(r.server, m)}
                            disabled={isAdding}
                            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-50 transition-colors shrink-0"
                          >
                            {isAdding ? (
                              <div className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
                            ) : (
                              <Plus className="w-3 h-3" />
                            )}
                            Add
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
            <p className="text-xs text-foreground-400">
              Scanned from your browser. If the control plane (and LiteLLM) run
              on another machine, these localhost models may not be reachable
              server-side.
            </p>
          </div>
        )}
      </div>

      {/* Registration form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div
          className={`grid ${layout === "grid" ? "grid-cols-2" : "grid-cols-1"} gap-3`}
        >
          {/* Name */}
          <div>
            <label className="block text-xs text-foreground-500 mb-1.5">
              Name *
            </label>
            <input
              autoFocus={!showExistingModels || existingModels.length === 0}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="GPT-4o"
              className={inputCls}
            />
          </div>

          {/* Provider */}
          <div>
            <label className="block text-xs text-foreground-500 mb-1.5">
              Provider
            </label>
            <select
              value={provider}
              onChange={(e) =>
                handleProviderChange(e.target.value as LlmProviderType)
              }
              className={inputCls}
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Base URL — not applicable to SDK-agent providers (local harness, no endpoint) */}
          {!isSdkAgent && (
            <div>
              <label className="block text-xs text-foreground-500 mb-1.5">
                Base URL *
              </label>
              <input
                value={baseUrl}
                onChange={(e) => {
                  setBaseUrl(e.target.value);
                  setAvailableModels([]);
                  setShowModelList(false);
                }}
                placeholder="https://api.openai.com/v1"
                className={inputCls}
              />
            </div>
          )}

          {/* Model ID */}
          <div>
            <label className="block text-xs text-foreground-500 mb-1.5">
              Model ID *
            </label>
            <input
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              placeholder="gpt-4o-mini"
              className={inputCls}
            />
          </div>

          {/* API Key */}
          <div className={layout === "grid" ? "col-span-2" : ""}>
            <label className="block text-xs text-foreground-500 mb-1.5">
              API Key{" "}
              <span className="text-foreground-400">
                (optional
                {isSdkAgent
                  ? " — leave blank to use this machine's existing CLI/OAuth session"
                  : ""}
                )
              </span>
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-…"
              className={inputCls}
            />
          </div>

          {isSdkAgent && (
            <div className={layout === "grid" ? "col-span-2" : ""}>
              <p className="text-xs px-3 py-2 rounded-xl border border-warning-300 bg-warning-50 text-warning-700">
                Experimental: runs the vendor&apos;s own agent harness (its own
                tool loop, permissions, sessions) locally in the agent
                controller via Mastra SDK Agents — not routed through LiteLLM.
                The internal tool registry is not forwarded; the harness manages
                its own tools/MCP servers.
              </p>
            </div>
          )}

          {/* Description */}
          {showDescription && (
            <div className={layout === "grid" ? "col-span-2" : ""}>
              <label className="block text-xs text-foreground-500 mb-1.5">
                Description{" "}
                <span className="text-foreground-400">(optional)</span>
              </label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                className={inputCls}
              />
            </div>
          )}
        </div>

        {/* Available models from test */}
        {showModelList && availableModels.length > 0 && (
          <div>
            <label className="block text-xs text-foreground-500 mb-1.5">
              Available models — click to select
            </label>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {availableModels.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setModelId(m);
                    setShowModelList(false);
                  }}
                  className={`w-full text-left text-xs px-3 py-2 rounded-lg border transition-colors truncate ${
                    modelId === m
                      ? "bg-primary-50 border-primary-400 text-primary-800"
                      : "bg-background-100 border-neutral-200 hover:border-primary-400/50 hover:bg-primary-500/5"
                  }`}
                  title={m}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Status message */}
        {formMsg && (
          <p
            className={`text-xs px-3 py-2 rounded-xl border ${
              formMsg.ok
                ? "bg-success-50 border-success-300 text-success-700"
                : "bg-danger-50 border-danger-300 text-danger-600"
            }`}
          >
            {formMsg.ok && <Check className="w-3 h-3 inline mr-1" />}
            {formMsg.text}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          {!isSdkAgent && (
            <button
              type="button"
              onClick={testConnection}
              disabled={testing || !baseUrl.trim() || !modelId.trim()}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-neutral-200 text-foreground-500 hover:text-foreground hover:bg-background-200 rounded-xl disabled:opacity-40 transition-colors"
            >
              {testing ? (
                <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              {testing ? "Testing…" : "Test"}
            </button>
          )}

          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-xl disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <Cpu className="w-4 h-4" />
            )}
            {saving ? "Registering…" : "Register"}
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="ml-auto text-sm text-foreground-500 hover:text-foreground transition-colors"
            >
              {showExistingModels && existingModels.length > 0
                ? "Done"
                : "Cancel"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
