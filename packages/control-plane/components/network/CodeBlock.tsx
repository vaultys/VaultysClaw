import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CodeBlock({
  code,
  language = "bash",
}: {
  code: string;
  language?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative group">
      <pre
        className={`bg-neutral-950 text-neutral-100 rounded-lg p-4 text-xs font-mono overflow-x-auto leading-relaxed whitespace-pre lang-${language}`}
      >
        {code}
      </pre>
      <button
        onClick={() => {
          navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="absolute top-2.5 right-2.5 flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 opacity-0 group-hover:opacity-100 transition-all"
      >
        {copied ? (
          <Check size={10} className="text-success-400" />
        ) : (
          <Copy size={10} />
        )}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
