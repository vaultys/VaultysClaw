"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
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
        <div className="space-y-3 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3">
          <p className="text-sm font-medium text-warning-700">
            Copy this signing secret now — it will not be shown again
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg border border-neutral-200 bg-background-100 px-3 py-2 font-mono text-xs">
              {created.secret}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(created.secret);
                setCopied(true);
              }}
              className="shrink-0 rounded-lg border border-neutral-200 bg-background-100 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background-200"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
        <Link
          href={`/admin/integrations/webhooks/${created.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-primary-700 hover:underline"
        >
          Done, view webhook
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
        </Link>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-6 max-w-2xl">
      {error && (
        <div className="rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
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
          className="w-full rounded-lg border border-neutral-200 bg-background px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Description (optional)</label>
        <input
          type="text"
          name="description"
          className="w-full rounded-lg border border-neutral-200 bg-background px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Endpoint URL</label>
        <input
          type="text"
          name="url"
          required
          placeholder="https://example.com/webhooks/vaultysclaw"
          className="w-full rounded-lg border border-neutral-200 bg-background px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30 font-mono"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Events</label>
        <div className="divide-y divide-neutral-200/60 rounded-lg border border-neutral-200">
          {EVENT_GROUPS.map((group) => (
            <div key={group} className="p-3">
              <div className="mb-2 text-xs text-foreground-500">{group}</div>
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
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-500 disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create webhook"}
        </button>
      </div>
    </form>
  );
}
