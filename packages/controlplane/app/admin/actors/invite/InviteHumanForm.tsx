"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { createInvitationAction } from "../actions";

const CAPABILITIES = [
  "portal_access",
  "admin_console_access",
  "knowledge_search",
  "agent_communication",
] as const;

/** Same "Client Component calling a `use server` action directly and awaiting the return value"
 *  reveal-once pattern as app/admin/integrations/webhooks/NewWebhookForm.tsx — the raw invite link
 *  can never be shown again after this response, so it must not go through a redirect. */
export default function InviteHumanForm({ workspaces }: { workspaces: { id: string; name: string }[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await createInvitationAction(formData);
        // Validation failures come back as data, not as a thrown error: a production build redacts
        // Server Action error messages, so a rejected invitation would otherwise show the admin a
        // React error digest instead of which address is already taken.
        if (result.ok) setCreated({ url: result.url });
        else setError(result.error);
      } catch (err) {
        // Still needed for the genuinely unexpected — a dropped connection, a database outage.
        // Those have no useful message to show, and shouldn't pretend to.
        setError(err instanceof Error ? err.message : "Failed to create invitation");
      }
    });
  }

  if (created) {
    return (
      <div className="space-y-4">
        <div className="bg-warning-50 border border-warning-200 rounded-xl p-4 space-y-3">
          <p className="text-sm text-warning-700 font-medium">
            Copy this invite link now — it will not be shown again, and it only works once.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-background-100 border border-neutral-200 rounded-lg px-3 py-2 overflow-x-auto">
              {created.url}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(created.url);
                setCopied(true);
              }}
              className="text-xs px-3 py-2 border border-neutral-200 rounded-lg hover:bg-background-200/60 transition-colors shrink-0"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
        <Link href="/admin/actors" className="inline-block text-sm text-primary-600 hover:underline">
          Done — back to Actors →
        </Link>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-6">
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
          placeholder="e.g. Alice Martin"
          className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Email (optional)</label>
        <input
          type="email"
          name="email"
          placeholder="Used for email notifications — optional"
          className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Workspace (optional)</label>
        <select
          name="workspaceId"
          className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
        >
          <option value="">No workspace</option>
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">
          Capabilities granted on acceptance
        </label>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm border border-neutral-200 rounded-lg p-3">
          {CAPABILITIES.map((cap) => (
            <label key={cap} className="flex items-center gap-1.5 text-foreground-700">
              <input
                type="checkbox"
                name="capabilities"
                value={cap}
                defaultChecked={cap === "portal_access"}
                className="accent-primary-600"
              />
              {cap}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Link expires in</label>
        <select
          name="expiryPreset"
          defaultValue="7d"
          className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
        >
          <option value="1d">1 day</option>
          <option value="7d">7 days</option>
          <option value="30d">30 days</option>
        </select>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {pending ? "Creating…" : "Create invite link"}
        </button>
      </div>
    </form>
  );
}
