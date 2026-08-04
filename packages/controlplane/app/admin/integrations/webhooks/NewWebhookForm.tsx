"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CONTROLPLANE_WEBHOOK_EVENTS } from "@/lib/webhook-events";
import { createWebhookAction } from "../actions";

const EVENT_GROUPS = Array.from(new Set(CONTROLPLANE_WEBHOOK_EVENTS.map((e) => e.group)));

/**
 * A Client Component calling a "use server" action directly (not via
 * `<form action>`) and awaiting its return value — Next.js supports this
 * natively, it's just not a pattern this rebuild has needed before now. It's
 * what lets the freshly generated secret be shown once, in place, right
 * after creation, without ever putting it in a URL or a redirect.
 */
export default function NewWebhookForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; secret: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await createWebhookAction(formData);
        setCreated(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create webhook");
      }
    });
  }

  if (created) {
    return (
      <div className="space-y-4 max-w-2xl">
        <div className="bg-warning-50 border border-warning-200 rounded-xl p-4 space-y-3">
          <p className="text-sm text-warning-700 font-medium">
            Copy this signing secret now — it will not be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-background-100 border border-neutral-200 rounded-lg px-3 py-2 overflow-x-auto">
              {created.secret}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(created.secret);
                setCopied(true);
              }}
              className="text-xs px-3 py-2 border border-neutral-200 rounded-lg hover:bg-background-200/60 transition-colors shrink-0"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
        <Link
          href={`/admin/integrations/webhooks/${created.id}`}
          className="inline-block text-sm text-primary-600 hover:underline"
        >
          Done — view webhook →
        </Link>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-6 max-w-2xl">
      {error && (
        <div className="bg-danger-50 border border-danger-200 rounded-lg px-3 py-2 text-sm text-danger-700">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Name</label>
        <input
          type="text"
          name="name"
          required
          placeholder="e.g. Ops SIEM"
          className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Description (optional)</label>
        <input
          type="text"
          name="description"
          className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Endpoint URL</label>
        <input
          type="text"
          name="url"
          required
          placeholder="https://example.com/webhooks/vaultysclaw"
          className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background font-mono"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Events</label>
        <div className="border border-neutral-200 rounded-lg divide-y divide-neutral-200/60">
          {EVENT_GROUPS.map((group) => (
            <div key={group} className="p-3">
              <div className="text-xs font-semibold text-foreground-500 uppercase mb-2">{group}</div>
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                {CONTROLPLANE_WEBHOOK_EVENTS.filter((e) => e.group === group).map((e) => (
                  <label key={e.type} className="flex items-center gap-1.5 text-foreground-700" title={e.description}>
                    <input type="checkbox" name="events" value={e.type} className="accent-primary-600" />
                    {e.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {pending ? "Creating…" : "Create webhook"}
        </button>
      </div>
    </form>
  );
}
