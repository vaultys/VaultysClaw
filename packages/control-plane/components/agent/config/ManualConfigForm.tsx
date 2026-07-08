"use client";

import { type LlmProviderType } from "@vaultysclaw/shared";
import type { AgentLlmConfigController } from "@/hooks/useAgentLlmConfig";
import { PROVIDER_OPTIONS, modelPlaceholder } from "./constants";

const INPUT_CLASS =
  "w-full bg-background-200 border border-neutral-300 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50";
const LABEL_CLASS =
  "text-xs text-foreground-500 uppercase tracking-wider font-medium block mb-1.5";

export function ManualConfigForm({ cfg }: { cfg: AgentLlmConfigController }) {
  const { llmForm, setLlmForm, llmConfig, llmSaving, cancelEdit, saveManualConfig } =
    cfg;
  const provider = PROVIDER_OPTIONS.find((p) => p.value === llmForm.provider)!;

  return (
    <form onSubmit={saveManualConfig} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={LABEL_CLASS}>Provider</label>
          <select
            value={llmForm.provider}
            onChange={(e) =>
              setLlmForm((f) => ({
                ...f,
                provider: e.target.value as LlmProviderType,
              }))
            }
            className={INPUT_CLASS}
          >
            {PROVIDER_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL_CLASS}>Model</label>
          <input
            type="text"
            required
            value={llmForm.model}
            onChange={(e) =>
              setLlmForm((f) => ({ ...f, model: e.target.value }))
            }
            placeholder={modelPlaceholder(llmForm.provider)}
            className={INPUT_CLASS}
          />
        </div>
        {provider.needsKey && (
          <div>
            <label className={LABEL_CLASS}>
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
              placeholder={llmConfig?.apiKeySet ? "••••••••••••••••" : "sk-…"}
              className={INPUT_CLASS}
            />
          </div>
        )}
        {provider.needsUrl && (
          <div>
            <label className={LABEL_CLASS}>Base URL</label>
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
              className={INPUT_CLASS}
            />
          </div>
        )}
        <div>
          <label className={LABEL_CLASS}>
            Max Tokens{" "}
            <span className="normal-case text-foreground-400">(optional)</span>
          </label>
          <input
            type="number"
            min={1}
            value={llmForm.maxTokens}
            onChange={(e) =>
              setLlmForm((f) => ({ ...f, maxTokens: e.target.value }))
            }
            placeholder="4096"
            className={INPUT_CLASS}
          />
        </div>
        {llmForm.provider === "claude-agent-sdk" && (
          <>
            <div>
              <label className={LABEL_CLASS}>
                Working Directory{" "}
                <span className="normal-case text-foreground-400">
                  (optional — defaults to the agent's cwd)
                </span>
              </label>
              <input
                type="text"
                value={llmForm.cwd}
                onChange={(e) =>
                  setLlmForm((f) => ({ ...f, cwd: e.target.value }))
                }
                placeholder="/home/agent/workspace"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>
                Allowed Tools{" "}
                <span className="normal-case text-foreground-400">
                  (optional, comma-separated)
                </span>
              </label>
              <input
                type="text"
                value={llmForm.allowedTools}
                onChange={(e) =>
                  setLlmForm((f) => ({ ...f, allowedTools: e.target.value }))
                }
                placeholder="Read, Grep, Glob, Bash"
                className={INPUT_CLASS}
              />
            </div>
          </>
        )}
      </div>
      <div>
        <label className={LABEL_CLASS}>
          System Prompt{" "}
          <span className="normal-case text-foreground-400">
            (optional — overrides default)
          </span>
        </label>
        <textarea
          rows={4}
          value={llmForm.systemPrompt}
          onChange={(e) =>
            setLlmForm((f) => ({ ...f, systemPrompt: e.target.value }))
          }
          placeholder="You are a secure agent…"
          className={`${INPUT_CLASS} resize-y`}
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={cancelEdit}
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
  );
}
