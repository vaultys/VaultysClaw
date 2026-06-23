import { useState } from "react";
import { Copy, Check as CheckIcon } from "lucide-react";

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      title={label ?? "Copy to clipboard"}
      className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border border-neutral-300 text-foreground-500 hover:text-foreground hover:bg-background-200 transition-colors"
    >
      {copied ? (
        <>
          <CheckIcon size={11} className="text-success-500" /> Copied
        </>
      ) : (
        <>
          <Copy size={11} /> Copy
        </>
      )}
    </button>
  );
}
