import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-background-200 border border-neutral-200 text-foreground-500 hover:text-foreground transition-colors"
    >
      {copied ? (
        <Check size={11} className="text-success-500" />
      ) : (
        <Copy size={11} />
      )}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
