"use client";

import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { type AgentInfo } from "@/lib/contracts";
import { useAgentLlmConfig } from "@/hooks/useAgentLlmConfig";
import { type ConfigMode } from "./config/constants";
import { AgentKeyForm } from "./config/AgentKeyForm";
import { AgentKeyView } from "./config/AgentKeyView";
import { LlmConfigView } from "./config/LlmConfigView";
import { ManualConfigForm } from "./config/ManualConfigForm";
import { ModelPickerForm } from "./config/ModelPickerForm";
import { ModeSelector } from "./config/ModeSelector";
import { NoConfigView } from "./config/NoConfigView";
import { WorkspaceRoutingForm } from "./config/WorkspaceRoutingForm";
import { ReportedLlmBanner } from "./config/ReportedLlmBanner";

export function ConfigTab({
  agent,
  onChanged,
}: {
  agent: AgentInfo;
  /** Ask the parent to refetch the agent after a key mutation. */
  onChanged?: () => void | Promise<void>;
}) {
  const cfg = useAgentLlmConfig(agent, onChanged);
  const {
    llmLoading,
    llmEditing,
    llmSaving,
    revoking,
    llmStatus,
    llmError,
    showClearConfirm,
    setShowClearConfirm,
    showRevokeConfirm,
    setShowRevokeConfirm,
    llmConfig,
    configMode,
    setConfigMode,
    litellmConfigured,
    hasWorkspaceRouting,
    workspaceLlmData,
    registryModels,
    liteLlmModels,
    activeIsAgentKey,
    openEdit,
    cancelEdit,
    clearConfig,
  } = cfg;

  const reportedLlm = agent.reportedLlm;

  if (llmLoading)
    return <p className="text-foreground-500 text-sm">Loading…</p>;

  const hasModels = liteLlmModels.length > 0 || registryModels.length > 0;

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
      id: "workspace",
      label: "Workspace Routing",
      disabled: !hasWorkspaceRouting,
      hint: !workspaceLlmData?.litellmConfigured
        ? "LiteLLM not configured"
        : "no models in workspace",
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
        message="The agent's LiteLLM virtual key will be removed. It will fall back to the workspace key (or manual config if set)."
        confirmLabel="Revoke key"
        variant="danger"
        loading={revoking}
        onConfirm={cfg.revokeAgentKey}
        onCancel={() => setShowRevokeConfirm(false)}
      />

      {reportedLlm && (
        <ReportedLlmBanner
          reportedLlm={reportedLlm}
          isLocalEnvConfig={!llmConfig && !activeIsAgentKey}
        />
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
              {activeIsAgentKey && (
                <button
                  onClick={() => setShowRevokeConfirm(true)}
                  className="text-xs text-danger-400 hover:text-danger-300 border border-danger-500/30 px-2.5 py-1.5 rounded-md transition-colors"
                >
                  Revoke key
                </button>
              )}
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

        {llmEditing ? (
          <div className="p-4 space-y-4">
            <ModeSelector mode={configMode} modes={MODES} onSelect={setConfigMode} />

            {llmError && (
              <p className="text-xs text-danger-500 bg-danger-50 border border-danger-200 rounded-lg px-3 py-2">
                {llmError}
              </p>
            )}

            {configMode === "agent-key" && <AgentKeyForm cfg={cfg} />}
            {configMode === "workspace" && <WorkspaceRoutingForm cfg={cfg} />}
            {configMode === "model" && <ModelPickerForm cfg={cfg} />}
            {configMode === "manual" && <ManualConfigForm cfg={cfg} />}
          </div>
        ) : activeIsAgentKey ? (
          <AgentKeyView agentKeyInfo={cfg.agentKeyInfo} />
        ) : llmConfig ? (
          <LlmConfigView cfg={cfg} />
        ) : (
          <NoConfigView
            litellmConfigured={litellmConfigured}
            hasWorkspaceRouting={hasWorkspaceRouting}
            registryModelCount={registryModels.length}
          />
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
