"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

/** Copies `text` to the clipboard and shows a transient "Copied!" confirmation. */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded bg-background-200 border border-neutral-200 text-foreground-500 hover:text-foreground transition-colors"
    >
      {copied ? (
        <Check size={12} className="text-success-500" />
      ) : (
        <Copy size={12} />
      )}
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}
