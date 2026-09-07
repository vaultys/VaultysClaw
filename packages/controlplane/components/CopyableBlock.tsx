"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * A raw artefact — a certificate token, a signed body, a signature — with a copy
 * button.
 *
 * The button is the point. These blocks are base64 blobs hundreds of characters
 * long with no word boundaries, and the thing an operator actually does with one
 * is paste it somewhere: into a host's `grant.token` to provision an
 * interception point by hand, or into a verifier to check it independently.
 * Selecting a wrapped `<pre>` with a mouse gets that wrong often enough to be
 * worse than useless — a token that lost its first character fails verification
 * with an error that says nothing about where the character went.
 *
 * `navigator.clipboard` needs a secure context, so it is absent over plain HTTP
 * on anything but localhost. The button then reports that rather than silently
 * doing nothing, because "I clicked copy and pasted an old buffer" is a
 * genuinely confusing failure.
 */
export default function CopyableBlock({
  value,
  label,
  filename,
}: {
  value: string;
  label?: string;
  /** When set, offers a download too — useful for a token destined for a file. */
  filename?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "unavailable">("idle");

  async function copy() {
    if (!navigator.clipboard) {
      setState("unavailable");
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
      setTimeout(() => setState("idle"), 1500);
    } catch {
      setState("unavailable");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        {label ? <div className="text-xs text-foreground-500">{label}</div> : <span />}
        <div className="flex items-center gap-2 shrink-0">
          {state === "unavailable" && (
            <span className="text-xs text-warning-700">
              Clipboard unavailable here — select the text manually.
            </span>
          )}
          {filename && (
            // A data: URL rather than a fetch: the value is already in the page,
            // and adding a route to hand back something already rendered would be
            // a second copy to keep honest.
            <a
              href={`data:text/plain;charset=utf-8,${encodeURIComponent(value)}`}
              download={filename}
              className="text-xs text-foreground-500 hover:text-foreground-700 underline"
            >
              Download
            </a>
          )}
          <button
            type="button"
            onClick={copy}
            className="text-xs inline-flex items-center gap-1 px-2 py-0.5 rounded border border-neutral-200 hover:bg-background-200 text-foreground-600"
          >
            {state === "copied" ? (
              <>
                <Check className="w-3 h-3" /> Copied
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" /> Copy
              </>
            )}
          </button>
        </div>
      </div>
      <pre className="text-[11px] font-mono bg-background-200/40 border border-neutral-200/60 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all text-foreground-500">
        {value}
      </pre>
      <p className="mt-1 text-xs text-foreground-400">{value.length} characters</p>
    </div>
  );
}
