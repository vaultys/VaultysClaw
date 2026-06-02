"use client";

import { useState } from "react";

const PROVIDERS = [
  { value: "openai-compatible", label: "OpenAI-compatible / vLLM" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google" },
  { value: "ollama", label: "Ollama" },
];

export function RegisterModelModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [provider, setProvider] = useState("openai-compatible");
  const [modelId, setModelId] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!modelId.trim()) {
      setError("Model ID is required");
      return;
    }
    if (!baseUrl.trim()) {
      setError("Base URL is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          provider,
          modelId,
          baseUrl,
          apiKey: apiKey || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to register model");
        setSaving(false);
        return;
      }
      onCreated();
      onClose();
    } catch {
      setError("Network error");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-background-100 border border-neutral-200 rounded-2xl shadow-xl w-full max-w-lg p-6">
        <h2 className="text-base font-semibold text-foreground mb-4">
          Register Model
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-foreground-500 mb-1">
              Name
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-background border border-neutral-200 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="e.g. Customer Support LLaMA"
            />
          </div>
          <div>
            <label className="block text-sm text-foreground-500 mb-1">
              Description
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-background border border-neutral-200 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Optional description"
            />
          </div>
          <div>
            <label className="block text-sm text-foreground-500 mb-1">
              Provider
            </label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full bg-background border border-neutral-200 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-foreground-500 mb-1">
              Model ID
            </label>
            <input
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className="w-full bg-background border border-neutral-200 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="e.g. meta-llama/Llama-3-8B-Instruct"
            />
            <p className="text-xs text-foreground-400 mt-1">
              The exact model name served by the endpoint
            </p>
          </div>
          <div>
            <label className="block text-sm text-foreground-500 mb-1">
              Base URL
            </label>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="w-full bg-background border border-neutral-200 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="http://vllm-service:8000"
            />
          </div>
          <div>
            <label className="block text-sm text-foreground-500 mb-1">
              API Key <span className="text-foreground-400">(optional)</span>
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full bg-background border border-neutral-200 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Leave empty if not required"
            />
          </div>
          {error && (
            <p className="text-danger-600 dark:text-danger-400 text-sm">
              {error}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-xl border border-neutral-200 text-sm text-foreground-500 hover:text-foreground hover:bg-background-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saving ? "Registering…" : "Register"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
