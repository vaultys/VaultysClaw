"use client";

import { useState, useTransition } from "react";
import { regenerateWebhookSecretAction } from "../actions";

export default function RegenerateSecretButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (secret) {
    return (
      <div className="bg-warning-50 border border-warning-200 rounded-xl p-4 space-y-3">
        <p className="text-sm text-warning-700 font-medium">
          Copy this signing secret now — it will not be shown again. The old secret no longer
          works.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs font-mono bg-background-100 border border-neutral-200 rounded-lg px-3 py-2 overflow-x-auto">
            {secret}
          </code>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(secret);
              setCopied(true);
            }}
            className="text-xs px-3 py-2 border border-neutral-200 rounded-lg hover:bg-background-200/60 transition-colors shrink-0"
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
      className="text-xs px-3 py-2 border border-neutral-200 rounded-lg hover:bg-background-200/60 transition-colors disabled:opacity-50"
    >
      {pending ? "Regenerating…" : "Regenerate secret"}
    </button>
  );
}
