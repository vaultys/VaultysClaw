"use client";

import { useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import type { ProxyActionResult } from "@/app/admin/actors/actions";

/**
 * Client wrappers for the two proxy-config forms.
 *
 * They exist for one reason: a Server Action that *throws* renders Next.js's
 * generic "A server error occurred" page and discards the message. All the care
 * in `lib/proxy-kind.ts`'s validation — telling an admin that a wildcard host is
 * refused because the verifier matches exact names or dot-prefixed suffixes, and
 * that such a rule would silently never fire — would never reach them. Found by
 * driving the panel in a real browser, not by type-checking.
 *
 * So the actions return `{ error }`, and these components await the result and
 * render it in place. Same shape as `NewWebhookForm.tsx`, which awaits a Server
 * Action to surface a one-time secret.
 */
function ActionError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="text-xs text-danger-700 bg-danger-100 border border-danger-200 rounded-lg px-3 py-2 flex gap-1.5"
    >
      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <span>{error}</span>
    </p>
  );
}

interface FormProps {
  action: (formData: FormData) => Promise<ProxyActionResult>;
  className?: string;
  children: React.ReactNode;
}

/**
 * A form that submits to a `ProxyActionResult`-returning action and shows any
 * error inline. On success the error clears and the form resets — the panel
 * re-renders from the server with the new state, so a stale "Add rule" row would
 * be misleading.
 */
export function ProxyActionForm({ action, className, children }: FormProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const formData = new FormData(form);
        startTransition(async () => {
          const result = await action(formData);
          setError(result.error ?? null);
          // Only reset on success: keeping the rejected values lets an admin fix
          // the one field that was wrong instead of retyping the whole rule.
          if (!result.error) form.reset();
        });
      }}
    >
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {error && <div className="sm:col-span-6 mt-2">
        <ActionError error={error} />
      </div>}
    </form>
  );
}
