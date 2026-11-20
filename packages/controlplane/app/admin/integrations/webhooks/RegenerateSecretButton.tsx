"use client";

import { useState, useTransition } from "react";
import { regenerateWebhookSecretAction } from "../actions";

export default function RegenerateSecretButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (secret) {
    return (
      <div className="space-y-3 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3">
        <p className="text-sm font-medium text-warning-700">
          Copy this signing secret now — it will not be shown again. The old secret no longer
          works.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 overflow-x-auto rounded-lg border border-neutral-200 bg-background-100 px-3 py-2 font-mono text-xs">
            {secret}
          </code>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(secret);
              setCopied(true);
            }}
            className="shrink-0 rounded-lg border border-neutral-200 bg-background-100 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background-200"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("Regenerate this webhook's signing secret? The old secret will stop working immediately."))
          return;
        startTransition(async () => {
          const newSecret = await regenerateWebhookSecretAction(id);
          setSecret(newSecret);
        });
      }}
      className="rounded-lg border border-neutral-200 bg-background-100 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background-200 disabled:opacity-50"
    >
      {pending ? "Regenerating…" : "Regenerate secret"}
    </button>
  );
}
