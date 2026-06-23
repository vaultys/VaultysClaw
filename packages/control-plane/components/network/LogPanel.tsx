import { useState, useEffect, useRef } from "react";
import { Terminal, Pin, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTimeOnly } from "@vaultysclaw/shared";
import type { NetworkLogEntry } from "@/lib/contracts";

const levelStyle: Record<NetworkLogEntry["level"], string> = {
  info: "text-success-400",
  warn: "text-warning-400",
  error: "text-danger-400",
};

export function LogPanel({ logs }: { logs: NetworkLogEntry[] }) {
  const [entries, setEntries] = useState<NetworkLogEntry[]>(logs);
  const [autoScroll, setAutoScroll] = useState(true);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Sync incoming logs into local state
  useEffect(() => {
    setEntries(logs);
  }, [logs]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [entries, autoScroll]);

  function handleScroll() {
    if (!bodyRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = bodyRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 24;
    setAutoScroll(atBottom);
  }

  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-neutral-800">
        <Terminal size={14} className="text-neutral-400 shrink-0" />
        <span className="text-xs font-semibold text-neutral-300">Logs</span>
        <span className="text-xs text-neutral-600 ml-0.5">
          ({entries.length})
        </span>
        <div className="flex-1" />
        <button
          onClick={() => setAutoScroll((v) => !v)}
          title={autoScroll ? "Auto-scroll on" : "Auto-scroll off"}
          className={cn(
            "p-1 rounded transition-colors",
            autoScroll
              ? "text-primary-400 hover:text-primary-300"
              : "text-neutral-600 hover:text-neutral-400"
          )}
        >
          {autoScroll ? <Pin size={12} /> : <ArrowDown size={12} />}
        </button>
        <button
          onClick={() => setEntries([])}
          className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors px-1.5 py-0.5 rounded hover:bg-neutral-800"
        >
          Clear
        </button>
      </div>

      {/* Body */}
      <div
        ref={bodyRef}
        onScroll={handleScroll}
        className="h-52 overflow-y-auto font-mono text-xs px-3 py-2 space-y-0.5"
      >
        {entries.length === 0 ? (
          <div className="flex items-center justify-center h-full text-neutral-600 text-xs">
            No events yet
          </div>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="flex items-start gap-2 py-0.5">
              <span className="text-neutral-600 shrink-0">
                [{formatTimeOnly(entry.timestamp)}]
              </span>
              <span
                className={cn(
                  "uppercase shrink-0 font-semibold text-[10px] tracking-wider",
                  levelStyle[entry.level]
                )}
              >
                {entry.level}
              </span>
              <span className="text-neutral-200">{entry.event}</span>
              {entry.detail && (
                <span className="text-neutral-500 truncate">
                  {entry.detail}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
