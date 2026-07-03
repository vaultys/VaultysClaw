"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";

export function ThinkingBlock({
  content,
  isStreaming,
}: {
  content: string;
  isStreaming: boolean;
}) {
  // Open live so the reasoning is visible as it streams; collapsed when
  // rendering historical messages (isStreaming === false at mount).
  const [open, setOpen] = useState(isStreaming);

  // Auto-open when a live reasoning stream begins on an already-mounted block.
  useEffect(() => {
    if (isStreaming) setOpen(true);
  }, [isStreaming]);

  // Click anywhere on the frame toggles it — but don't collapse when the user
  // is actually selecting/copying the reasoning text.
  const toggle = () => {
    if (window.getSelection()?.toString()) return;
    setOpen((v) => !v);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen((v) => !v);
        }
      }}
      className="mb-2 text-xs border border-neutral-200/50 rounded-lg overflow-hidden cursor-pointer select-none"
    >
      <div className="px-3 py-1.5 flex items-center gap-1.5 bg-background-100/50 hover:bg-background-100 transition-colors text-foreground-500">
        <ChevronRight
          size={12}
          className={`transition-transform ${open ? "rotate-90" : ""}`}
        />
        {isStreaming ? (
          <span className="animate-pulse">Thinking…</span>
        ) : (
          <span>{open ? "Hide reasoning" : "View reasoning"}</span>
        )}
      </div>
      {open && (
        <pre className="whitespace-pre-wrap font-mono text-xs text-foreground-500 bg-background-100 p-3 m-0 leading-relaxed cursor-text select-text">
          {content}
        </pre>
      )}
    </div>
  );
}
