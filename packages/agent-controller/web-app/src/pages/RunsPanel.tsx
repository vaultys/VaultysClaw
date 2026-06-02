import { useState } from "react";
import type { IntentEntry } from "../types";

interface Props {
  intents: IntentEntry[];
}

type RunOutput = {
  text?: string;
  usage?: { promptTokens?: number; completionTokens?: number };
};
type Filter = "all" | "success" | "failed" | "pending";

const STATUS_DOT: Record<string, string> = {
  success: "bg-success",
  failed: "bg-danger",
  pending: "bg-attention animate-pulse",
};

const STATUS_BADGE: Record<string, string> = {
  success: "text-success bg-success-emphasis",
  failed: "text-danger bg-danger-emphasis",
  pending: "text-attention bg-[#2d2a00]",
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] text-fg-muted uppercase tracking-widest font-bold mb-1.5">
      {children}
    </p>
  );
}

export default function RunsPanel({ intents }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const counts: Record<Filter, number> = {
    all: intents.length,
    success: intents.filter((i) => i.status === "success").length,
    failed: intents.filter((i) => i.status === "failed").length,
    pending: intents.filter((i) => i.status === "pending").length,
  };

  const filtered =
    filter === "all" ? intents : intents.filter((i) => i.status === filter);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border-muted bg-canvas-subtle flex-shrink-0">
        <div>
          <span className="text-[11px] font-bold text-fg-muted uppercase tracking-widest">
            Agent.generate()
          </span>
          <span className="text-fg-dim text-[11px] ml-2">runs</span>
        </div>
        <div className="flex gap-1 ml-auto">
          {(["all", "success", "failed", "pending"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-0.5 text-[10px] rounded-full font-medium transition-colors flex items-center gap-1 ${
                filter === f
                  ? "bg-accent text-white"
                  : "text-fg-muted hover:text-fg"
              }`}
            >
              {f}{" "}
              {counts[f] > 0 && (
                <span className="tabular-nums">{counts[f]}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Run list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-fg-dim">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1}
              className="w-10 h-10 opacity-30"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347c-.75.412-1.667-.13-1.667-.986V5.653z"
              />
            </svg>
            <p className="text-sm">No runs yet</p>
            <p className="text-xs">Agent.generate() calls appear here</p>
          </div>
        ) : (
          <div className="divide-y divide-border-muted">
            {filtered.map((run) => {
              const out = run.output as RunOutput | undefined;
              const isExpanded = expandedId === run.intentId;
              const totalTokens = out?.usage
                ? (out.usage.promptTokens ?? 0) +
                  (out.usage.completionTokens ?? 0)
                : null;
              const durationMs = run.completedAt
                ? new Date(run.completedAt).getTime() -
                  new Date(run.receivedAt).getTime()
                : null;

              return (
                <div
                  key={run.intentId}
                  className="hover:bg-canvas-subtle transition-colors"
                >
                  <button
                    className="w-full text-left px-4 py-3 flex items-start gap-3"
                    onClick={() =>
                      setExpandedId(isExpanded ? null : run.intentId)
                    }
                  >
                    {/* Status dot */}
                    <span
                      className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[run.status] ?? "bg-fg-dim"}`}
                    />

                    <div className="flex-1 min-w-0 space-y-0.5">
                      {/* Action + status */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="text-accent text-xs font-mono">
                          {run.action}
                        </code>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${STATUS_BADGE[run.status] ?? ""}`}
                        >
                          {run.status}
                        </span>
                      </div>

                      {/* Params preview */}
                      {Object.keys(run.params).length > 0 && (
                        <p className="text-fg-dim text-[11px] font-mono truncate">
                          {JSON.stringify(run.params).slice(0, 120)}
                        </p>
                      )}

                      {/* Output preview */}
                      {out?.text && !isExpanded && (
                        <p className="text-fg-muted text-xs truncate leading-relaxed">
                          {out.text.slice(0, 140)}
                          {out.text.length > 140 ? "…" : ""}
                        </p>
                      )}

                      {/* Error preview */}
                      {run.error && !isExpanded && (
                        <p className="text-danger text-xs truncate">
                          {run.error}
                        </p>
                      )}
                    </div>

                    {/* Meta column */}
                    <div className="flex-shrink-0 text-right space-y-0.5">
                      {totalTokens !== null && (
                        <p className="text-fg-dim text-[10px] tabular-nums">
                          {totalTokens} tok
                        </p>
                      )}
                      {durationMs !== null && (
                        <p className="text-fg-dim text-[10px] tabular-nums">
                          {(durationMs / 1000).toFixed(1)}s
                        </p>
                      )}
                      <p className="text-fg-dim text-[10px]">
                        {run.receivedAt.slice(11, 19)}
                      </p>
                      <span className="text-fg-dim text-[10px]">
                        {isExpanded ? "▲" : "▼"}
                      </span>
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-3 border-t border-border-muted bg-canvas">
                      {/* Params */}
                      {Object.keys(run.params).length > 0 && (
                        <section className="pt-3">
                          <Label>Input Parameters</Label>
                          <pre className="text-fg-muted text-xs bg-canvas-subtle border border-border-muted rounded p-3 overflow-x-auto whitespace-pre-wrap">
                            {JSON.stringify(run.params, null, 2)}
                          </pre>
                        </section>
                      )}

                      {/* Output text */}
                      {out?.text && (
                        <section className="pt-3">
                          <Label>Output — Agent response</Label>
                          <div className="bg-canvas-subtle border border-border-muted rounded p-3">
                            <p className="text-fg text-sm whitespace-pre-wrap leading-relaxed">
                              {out.text}
                            </p>
                          </div>
                        </section>
                      )}

                      {/* Token usage */}
                      {out?.usage && (
                        <section className="pt-1">
                          <Label>Token Usage</Label>
                          <div className="flex gap-3 text-xs flex-wrap">
                            <div className="bg-canvas-subtle border border-border-muted rounded px-3 py-1.5 flex items-center gap-2">
                              <span className="text-fg-muted">Prompt</span>
                              <span className="text-fg font-mono tabular-nums">
                                {out.usage.promptTokens ?? 0}
                              </span>
                            </div>
                            <div className="bg-canvas-subtle border border-border-muted rounded px-3 py-1.5 flex items-center gap-2">
                              <span className="text-fg-muted">Completion</span>
                              <span className="text-fg font-mono tabular-nums">
                                {out.usage.completionTokens ?? 0}
                              </span>
                            </div>
                            <div className="bg-canvas-subtle border border-accent rounded px-3 py-1.5 flex items-center gap-2">
                              <span className="text-fg-muted">Total</span>
                              <span className="text-accent font-mono tabular-nums font-bold">
                                {(out.usage.promptTokens ?? 0) +
                                  (out.usage.completionTokens ?? 0)}
                              </span>
                            </div>
                          </div>
                        </section>
                      )}

                      {/* Error */}
                      {run.error && (
                        <section className="pt-1">
                          <Label>Error</Label>
                          <pre className="text-danger text-xs bg-danger-emphasis border border-danger rounded p-3 overflow-x-auto whitespace-pre-wrap">
                            {run.error}
                          </pre>
                        </section>
                      )}

                      {/* Timing */}
                      <section className="pt-1">
                        <Label>Timing</Label>
                        <div className="flex gap-4 text-[11px] text-fg-muted flex-wrap">
                          <span>
                            Received:{" "}
                            {new Date(run.receivedAt).toLocaleTimeString()}
                          </span>
                          {run.completedAt && (
                            <>
                              <span>
                                Completed:{" "}
                                {new Date(run.completedAt).toLocaleTimeString()}
                              </span>
                              {durationMs !== null && (
                                <span>
                                  Duration: {(durationMs / 1000).toFixed(2)}s
                                </span>
                              )}
                            </>
                          )}
                          <span className="font-mono text-fg-dim">
                            {run.intentId.slice(0, 12)}…
                          </span>
                        </div>
                      </section>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
