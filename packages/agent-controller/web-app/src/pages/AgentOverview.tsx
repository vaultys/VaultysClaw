import { useState, useEffect, useCallback } from "react";
import type { AgentInfo, IntentEntry, LlmConfigSafe, ToolEntry } from "../types";

interface Props {
  info: AgentInfo;
  intents: IntentEntry[];
}

type RunOutput = { text?: string; usage?: { promptTokens?: number; completionTokens?: number } };

function fmtUptime(s: number) {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-canvas-subtle border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border-muted">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-fg-muted">{title}</h3>
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

function Field({ label, value, mono = false, highlight = false }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-fg-muted uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-sm ${mono ? "font-mono text-xs" : ""} ${highlight ? "text-fg font-medium" : "text-fg-muted"}`}>{value}</p>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center min-w-[56px]">
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      <p className="text-[10px] text-fg-muted uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  );
}

export default function AgentOverview({ info, intents }: Props) {
  const [llmCfg, setLlmCfg] = useState<LlmConfigSafe | null>(null);
  const [tools, setTools] = useState<ToolEntry[]>([]);

  const load = useCallback(async () => {
    const [cfgRes, toolsRes] = await Promise.all([
      fetch("/api/config/llm").then((r) => r.json()).catch(() => null),
      fetch("/api/tools").then((r) => r.json()).catch(() => ({ tools: [] })),
    ]);
    if (cfgRes && !cfgRes.none) setLlmCfg(cfgRes as LlmConfigSafe);
    setTools(toolsRes.tools ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const model = llmCfg
    ? `${llmCfg.provider}/${llmCfg.model}`
    : info.activeLlmProvider && info.activeLlmModel
      ? `${info.activeLlmProvider}/${info.activeLlmModel}`
      : null;

  const successCount = intents.filter((i) => i.status === "success").length;
  const failedCount = intents.filter((i) => i.status === "failed").length;
  const pendingCount = intents.filter((i) => i.status === "pending").length;
  const recentRuns = intents.slice(0, 8);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Identity */}
      <Card title="Mastra Agent">
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          <Field label="Name" value={info.name} highlight />
          <Field label="Agent ID" value={`${info.id.slice(0, 20)}…`} mono />
          <Field label="Version" value={info.version} mono />
          <Field label="Uptime" value={fmtUptime(info.uptime)} />
        </div>
      </Card>

      {/* Model / Instructions */}
      <Card title="Model Configuration">
        {model ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <code className="text-accent text-sm bg-canvas px-2.5 py-1 rounded border border-border-muted font-mono">
                {model}
              </code>
              <span className="text-fg-dim text-[11px]">Mastra model specifier</span>
            </div>
            {llmCfg?.systemPrompt && (
              <div>
                <p className="text-[10px] text-fg-muted uppercase tracking-wide mb-1">Instructions (system prompt)</p>
                <p className="text-fg-muted text-xs bg-canvas px-3 py-2 rounded border border-border-muted leading-relaxed line-clamp-4">
                  {llmCfg.systemPrompt}
                </p>
              </div>
            )}
            {llmCfg?.maxTokens && (
              <p className="text-xs text-fg-muted">
                Max output tokens: <span className="text-fg font-mono">{llmCfg.maxTokens}</span>
              </p>
            )}
          </div>
        ) : (
          <p className="text-attention text-sm">
            No model configured.{" "}
            <span className="text-fg-muted">Go to <span className="text-accent">Settings</span> to configure an LLM.</span>
          </p>
        )}
      </Card>

      {/* Tools */}
      <Card title={`Tools (${tools.length}) — Agent.tools`}>
        {tools.length === 0 ? (
          <p className="text-fg-dim text-xs">
            No tools registered. Tools are enabled by capabilities granted from the control plane.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tools.map((t) => (
              <span
                key={t.name}
                className={`text-xs font-mono px-2 py-0.5 rounded border ${
                  t.requiresApproval
                    ? "border-attention text-attention bg-[#2d2a00]"
                    : "border-border-muted text-fg bg-canvas"
                }`}
                title={`capability: ${t.capability}${t.requiresApproval ? " · requires approval" : " · auto-execute"}`}
              >
                {t.name}
              </span>
            ))}
          </div>
        )}
      </Card>

      {/* Capabilities */}
      {info.capabilities.length > 0 && (
        <Card title="Capabilities">
          <div className="flex flex-wrap gap-2">
            {info.capabilities.map((c) => (
              <span
                key={c}
                className="bg-canvas-overlay border border-border-muted text-info text-xs px-2 py-0.5 rounded-full"
              >
                {c}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Run stats */}
      <Card title="Agent.generate() Statistics">
        <div className="flex gap-8">
          <Stat label="Total" value={intents.length} color="text-fg" />
          <Stat label="Success" value={successCount} color="text-success" />
          <Stat label="Failed" value={failedCount} color="text-danger" />
          <Stat label="Pending" value={pendingCount} color="text-attention" />
        </div>
      </Card>

      {/* Recent runs */}
      {recentRuns.length > 0 && (
        <Card title="Recent Runs">
          <div className="divide-y divide-border-muted">
            {recentRuns.map((run) => {
              const out = run.output as RunOutput | undefined;
              const totalTokens = out?.usage
                ? (out.usage.promptTokens ?? 0) + (out.usage.completionTokens ?? 0)
                : null;
              return (
                <div key={run.intentId} className="flex items-start gap-2.5 py-2 first:pt-0 last:pb-0">
                  <span
                    className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                      run.status === "success"
                        ? "bg-success"
                        : run.status === "failed"
                          ? "bg-danger"
                          : "bg-attention"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <code className="text-accent text-xs">{run.action}</code>
                    {out?.text && (
                      <p className="text-fg-muted text-[11px] mt-0.5 truncate">
                        {out.text.slice(0, 100)}{out.text.length > 100 ? "…" : ""}
                      </p>
                    )}
                    {run.error && (
                      <p className="text-danger text-[11px] mt-0.5 truncate">{run.error}</p>
                    )}
                  </div>
                  <div className="flex-shrink-0 text-right">
                    {totalTokens !== null && (
                      <p className="text-fg-dim text-[10px]">{totalTokens} tok</p>
                    )}
                    <p className="text-fg-dim text-[10px]">{run.receivedAt.slice(11, 19)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
