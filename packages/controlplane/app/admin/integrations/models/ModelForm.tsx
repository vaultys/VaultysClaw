"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { PROVIDERS, PROVIDER_IDS, isRoutableThroughLiteLLM } from "@/lib/model-providers";
import type { LlmProviderType } from "@vaultysclaw/shared";
import { probeModelEndpointAction } from "../actions";

/**
 * Register/edit form for a Model Registry entry, shared by `new/` and `[id]/`.
 *
 * A Client Component because three things here are genuinely interactive and
 * would otherwise each need a round-trip: picking a provider prefills the base
 * URL and hides it entirely for SDK-agent providers (which have no endpoint),
 * and "Test connection" probes the endpoint *before* anything is written, then
 * turns the models it found into a picklist for the model-id field.
 *
 * The probe runs as a Server Action rather than a `fetch` from the browser: the
 * endpoint is frequently on a private network the admin's browser can't reach
 * (an Ollama box, a self-hosted vLLM) and the API key must never leave the
 * server. `lib/model-providers.ts` is a pure module, so importing it here does
 * not drag anything server-only into the client bundle.
 */
export default function ModelForm({
  action,
  model,
  submitLabel,
}: {
  action: (formData: FormData) => void;
  model?: {
    id: string;
    name: string;
    description: string | null;
    provider: string;
    modelId: string;
    baseUrl: string;
    hasApiKey: boolean;
  };
  submitLabel: string;
}) {
  const isEdit = !!model;
  const [provider, setProvider] = useState<LlmProviderType>(
    (model?.provider as LlmProviderType) ?? "openai"
  );
  const [baseUrl, setBaseUrl] = useState(model?.baseUrl ?? PROVIDERS.openai.defaultBaseUrl);
  const [modelId, setModelId] = useState(model?.modelId ?? "");
  const [apiKey, setApiKey] = useState("");
  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState<{ ok: boolean; models: string[]; error?: string } | null>(null);

  const meta = PROVIDERS[provider];
  const routable = isRoutableThroughLiteLLM(provider);

  function onProviderChange(next: LlmProviderType) {
    setProvider(next);
    // Only overwrite a base URL the admin hasn't customised — switching providers
    // by accident shouldn't silently discard a hand-typed endpoint.
    const wasDefault = PROVIDER_IDS.some((p) => PROVIDERS[p].defaultBaseUrl === baseUrl);
    if (!baseUrl || wasDefault) setBaseUrl(PROVIDERS[next].defaultBaseUrl);
    setProbe(null);
  }

  async function onTest() {
    setProbing(true);
    setProbe(null);
    try {
      setProbe(await probeModelEndpointAction(baseUrl, apiKey || undefined));
    } catch (err) {
      setProbe({ ok: false, models: [], error: err instanceof Error ? err.message : "Failed" });
    } finally {
      setProbing(false);
    }
  }

  return (
    <form action={action} className="space-y-6 max-w-2xl">
      {isEdit && <input type="hidden" name="id" value={model.id} />}

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Name</label>
        <input
          type="text"
          name="name"
          required
          defaultValue={model?.name}
          placeholder="e.g. GPT-4o"
          className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
        />
        <p className="text-xs text-foreground-400 mt-1">
          How this model is referred to across the console
          {routable && <> — also the name it&apos;s registered under in LiteLLM.</>}
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Description (optional)</label>
        <input
          type="text"
          name="description"
          defaultValue={model?.description ?? ""}
          className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Provider</label>
        {/* The provider is fixed after creation: it determines the LiteLLM name and
            the wire format, so changing it in place would silently orphan the
            upstream registration. Re-register instead. */}
        <select
          name="provider"
          value={provider}
          onChange={(e) => onProviderChange(e.target.value as LlmProviderType)}
          disabled={isEdit}
          className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background disabled:opacity-60"
        >
          {PROVIDER_IDS.map((p) => (
            <option key={p} value={p}>
              {PROVIDERS[p].label}
            </option>
          ))}
        </select>
        {isEdit && (
          <p className="text-xs text-foreground-400 mt-1">
            Provider can&apos;t be changed after registration — register a new model instead.
          </p>
        )}
        {!routable && !isEdit && (
          <p className="text-xs text-warning-700 mt-1">
            Agent-SDK providers run the vendor&apos;s own harness rather than an HTTP endpoint, so
            this model is catalogued here but never routed through LiteLLM.
          </p>
        )}
      </div>

      {routable && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Base URL</label>
          <input
            type="text"
            name="baseUrl"
            required
            value={baseUrl}
            onChange={(e) => {
              setBaseUrl(e.target.value);
              setProbe(null);
            }}
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background font-mono"
          />
        </div>
      )}
      {!routable && <input type="hidden" name="baseUrl" value="" />}

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">
          API key {meta.needsApiKey ? "" : "(optional for this provider)"}
        </label>
        <input
          type="password"
          name="apiKey"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={model?.hasApiKey ? "Leave blank to keep the current key" : ""}
          className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background font-mono"
        />
        <p className="text-xs text-foreground-400 mt-1">
          Encrypted at rest and never shown again after this
          {model?.hasApiKey && <> — a key is currently set.</>}
        </p>
      </div>

      {routable && (
        <div className="border border-neutral-200/60 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-foreground-600">
              Check the endpoint answers before saving.
            </div>
            <button
              type="button"
              onClick={onTest}
              disabled={probing || !baseUrl}
              className="text-xs px-3 py-1.5 border border-neutral-200 rounded-lg hover:bg-background-200/60 transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {probing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Test connection
            </button>
          </div>
          {probe && (
            <div
              className={`text-xs flex items-start gap-1.5 ${
                probe.ok ? "text-success-700" : "text-danger-600"
              }`}
            >
              {probe.ok ? (
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              ) : (
                <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              )}
              <div>
                {probe.ok
                  ? `Reachable — ${probe.models.length} model${probe.models.length === 1 ? "" : "s"} advertised.`
                  : `Couldn't reach it: ${probe.error}`}
                {probe.ok && probe.models.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {probe.models.slice(0, 24).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setModelId(m)}
                        className={`px-1.5 py-0.5 rounded border font-mono transition-colors ${
                          modelId === m
                            ? "bg-primary-100 text-primary-700 border-primary-200"
                            : "border-neutral-200 text-foreground-500 hover:bg-background-200/60"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Model ID</label>
        <input
          type="text"
          name="modelId"
          required
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          placeholder={meta.exampleModelId}
          className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background font-mono"
        />
        <p className="text-xs text-foreground-400 mt-1">
          The identifier the provider itself knows this model by.
        </p>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
