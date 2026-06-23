import { Wrench, Clock, AlertTriangle } from "lucide-react";
import type { ToolExecutionDetails } from "@/lib/contracts";

/** Structured display for tool_execution activity log entries. */
export function ToolExecutionPanel({
  details,
}: {
  details: ToolExecutionDetails;
}) {
  const hasArgs = details.args && Object.keys(details.args).length > 0;
  const hasResult = details.result !== undefined && details.result !== null;
  const hasError = !!details.error;

  return (
    <div className="space-y-3">
      {/* Tool name + duration */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-secondary-100 border border-secondary-300 text-secondary-600">
            <Wrench size={14} />
          </div>
          <span className="text-sm font-semibold text-foreground font-mono">
            {details.toolName ?? "unknown tool"}
          </span>
        </div>
        {details.durationMs !== undefined && details.durationMs > 0 && (
          <span className="flex items-center gap-1 text-xs text-foreground-400">
            <Clock size={11} /> {details.durationMs}ms
          </span>
        )}
      </div>

      {/* Origin: intentId or conversationId */}
      {(details.intentId || details.conversationId) && (
        <div className="flex flex-wrap gap-2 text-[11px]">
          {details.intentId && (
            <span className="bg-primary-100 border border-primary-300 text-primary-700 px-2 py-0.5 rounded font-mono">
              intent: {details.intentId}
            </span>
          )}
          {details.conversationId && (
            <span className="bg-background-200 border border-neutral-300 text-foreground-500 px-2 py-0.5 rounded font-mono">
              chat: {details.conversationId}
            </span>
          )}
        </div>
      )}

      {/* Args */}
      {hasArgs && (
        <div className="space-y-1.5">
          <p className="text-xs text-foreground-400 uppercase tracking-wider">
            Arguments
          </p>
          <div className="bg-background border border-neutral-200 rounded-lg divide-y divide-neutral-100 text-xs">
            {Object.entries(details.args!).map(([k, v]) => (
              <div key={k} className="flex gap-3 px-3 py-2 min-h-0">
                <span className="font-mono text-foreground-500 shrink-0 w-32 truncate">
                  {k}
                </span>
                <span className="font-mono text-foreground break-all">
                  {typeof v === "string" ? v : JSON.stringify(v)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {!hasArgs && (
        <p className="text-xs text-foreground-400 italic">No arguments</p>
      )}

      {/* Result */}
      {hasResult && !hasError && (
        <div className="space-y-1.5">
          <p className="text-xs text-foreground-400 uppercase tracking-wider">
            Result
          </p>
          <pre className="bg-background border border-neutral-200 rounded-lg p-3 text-xs font-mono text-foreground-700 overflow-x-auto whitespace-pre-wrap break-all max-h-48">
            {typeof details.result === "string"
              ? details.result
              : JSON.stringify(details.result, null, 2)}
          </pre>
        </div>
      )}

      {/* Error */}
      {hasError && (
        <div className="flex items-start gap-2 bg-danger-500/10 border border-danger-500/20 rounded-lg px-3 py-2 text-xs text-danger-600">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <span className="font-mono break-all">{details.error}</span>
        </div>
      )}
    </div>
  );
}
