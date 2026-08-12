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
        className="px-3 py-1.5 border border-neutral-200 text-xs rounded-lg hover:bg-background-200/60 transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
      >
        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        Re-push all models
      </button>
      {result && (
        <span
          className={`text-xs ${result.failed > 0 ? "text-warning-700" : "text-success-700"}`}
        >
          {result.pushed} pushed{result.failed > 0 && `, ${result.failed} failed`}
        </span>
      )}
    </>
  );
}
