"use client";

export function ThinkingBlock({
  content,
  isStreaming,
}: {
  content: string;
  isStreaming: boolean;
}) {
  return (
    <details className="mb-2 text-xs border border-neutral-200/50 rounded-lg overflow-hidden">
      <summary className="px-3 py-1.5 cursor-pointer select-none flex items-center gap-1.5 bg-background-100/50 hover:bg-background-100 transition-colors list-none text-foreground-500">
        {isStreaming ? (
          <span className="animate-pulse">Thinking…</span>
        ) : (
          <span>View reasoning</span>
        )}
      </summary>
      <pre className="whitespace-pre-wrap font-mono text-xs text-foreground-500 bg-background-100 p-3 m-0 leading-relaxed">
        {content}
      </pre>
    </details>
  );
}
