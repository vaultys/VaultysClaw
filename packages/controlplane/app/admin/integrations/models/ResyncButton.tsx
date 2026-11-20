"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { resyncLiteLLMAction } from "../actions";

/**
 * Push every routable model to the proxy again — the "I just connected LiteLLM"
 * catch-up, since models registered while it was unconfigured were never pushed.
 *
 * `type="button"` matters: this renders inside the connection `<form>`, and the
 * default submit type would post that form instead of running this action.
 * A Client Component rather than a form action because the interesting part is
 * the result count, which it reports in place.
 */
export default function ResyncButton({ disabled }: { disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ pushed: number; failed: number } | null>(null);

  return (
    <>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={async () => {
          setBusy(true);
          setResult(null);
          try {
            setResult(await resyncLiteLLMAction());
          } finally {
            setBusy(false);
          }
        }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-background-100 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background-200 disabled:opacity-50"
      >
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />}
        Re-push all models
      </button>
      {result && (
        <span
          className={`text-xs tabular-nums ${result.failed > 0 ? "text-warning-700" : "text-foreground-600"}`}
        >
          {result.pushed} pushed{result.failed > 0 && `, ${result.failed} failed`}
        </span>
      )}
    </>
  );
}
