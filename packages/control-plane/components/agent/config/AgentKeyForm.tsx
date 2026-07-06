"use client";

import { RefreshCw } from "lucide-react";
import type { AgentLlmConfigController } from "@/hooks/useAgentLlmConfig";

export function AgentKeyForm({ cfg }: { cfg: AgentLlmConfigController }) {
  const {
    keyModels,
    setKeyModels,
    keyModelInput,
    setKeyModelInput,
    keyBudget,
    setKeyBudget,
    keySaving,
    agentKeyInfo,
    cancelEdit,
    saveAgentKey,
  } = cfg;

  function addModel() {
    const m = keyModelInput.trim();
    if (m && !keyModels.includes(m)) setKeyModels((p) => [...p, m]);
    setKeyModelInput("");
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-foreground-500">
        Provision a virtual key scoped to this agent in the LiteLLM proxy. Any
        existing manual config will be cleared — the agent key becomes the
        effective LLM config.
      </p>

      {/* Model tags */}
      <div>
        <label className="text-xs text-foreground-500 uppercase tracking-wider font-medium block mb-1.5">
          Allowed models{" "}
          <span className="normal-case text-foreground-400">
            (empty = inherit from workspace)
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
                    setKeyModels((prev) => prev.filter((x) => x !== m))
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
                addModel();
              }
            }}
            placeholder="gpt-4o  or  claude-sonnet-4-5"
            className="flex-1 bg-background-200 border border-neutral-300 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground-400 font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/50"
          />
          <button
            type="button"
            onClick={addModel}
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
          <span className="normal-case text-foreground-400">(optional)</span>
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
          onClick={cancelEdit}
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
              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Provisioning…
            </>
          ) : agentKeyInfo.configured ? (
            "Refresh Key"
          ) : (
            "Provision Key & Push to Agent"
          )}
        </button>
      </div>
    </div>
  );
}
