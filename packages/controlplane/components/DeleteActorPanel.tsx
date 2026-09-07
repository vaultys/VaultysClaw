"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2 } from "lucide-react";
import { deleteActorAction } from "@/app/admin/actors/actions";

/**
 * The Actor detail page's delete control.
 *
 * A Client Component awaiting the action's return value, for the reason every
 * form in this console does: a Server Action that *throws* renders Next.js's
 * generic error page in a production build and discards the message, so the
 * reason a deletion was refused would never reach the admin.
 *
 * Two things it is deliberately heavy about. **Typing the name** — this is
 * irreversible and it revokes grants on machines the admin is not looking at,
 * and a one-click button for that is a button people press by accident. And
 * **naming the certificate count up front**, because "delete this Actor" reads
 * like removing a row, and what it actually does is end every grant the Actor
 * holds. An admin who learns that from the confirmation dialog rather than from
 * a broken deployment is the entire point of the dialog.
 */
export default function DeleteActorPanel({
  did,
  name,
  activeCertificateCount,
}: {
  did: string;
  name: string;
  activeCertificateCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <section className="space-y-3 border border-danger-200 rounded-xl bg-danger-100/30 p-4">
      <h2 className="text-sm font-semibold text-danger-700 flex items-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5" />
        Delete this Actor
      </h2>

      <p className="text-xs text-foreground-600">
        {activeCertificateCount > 0 ? (
          <>
            This will <strong>revoke {activeCertificateCount} active certificate
            {activeCertificateCount === 1 ? "" : "s"}</strong> and then remove the Actor. Any host
            holding one stops being authorized at its next status check — including hosts that
            enforce offline and are not connected right now.
          </>
        ) : (
          <>This Actor holds no active certificates. Removing it ends nothing that is still running.</>
        )}{" "}
        The audit trail is kept: what this Actor did stays in the log, and the deletion is recorded
        with the ids of every certificate it revoked.
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-danger-200 text-danger-700 hover:bg-danger-100"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete Actor…
        </button>
      ) : (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData();
            formData.set("did", did);
            formData.set("confirmName", typed);
            startTransition(async () => {
              const result = await deleteActorAction(formData);
              if (result.error) {
                setError(result.error);
                return;
              }
              // The Actor's own page no longer exists.
              router.push("/admin/actors");
            });
          }}
        >
          <label className="block text-xs text-foreground-600">
            Type <code className="font-mono text-danger-700">{name}</code> to confirm
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="mt-1 w-full max-w-sm text-sm rounded-lg border border-neutral-200 bg-background-50 px-2 py-1.5"
            />
          </label>
          {error && (
            <p
              role="alert"
              className="text-xs text-danger-700 bg-danger-100 border border-danger-200 rounded-lg px-3 py-2 flex gap-1.5"
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={pending || typed !== name}
              className="text-xs px-3 py-1.5 rounded-lg bg-danger-600 text-white hover:bg-danger-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {pending ? "Deleting…" : "Delete permanently"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTyped("");
                setError(null);
              }}
              className="text-xs px-3 py-1.5 rounded-lg border border-neutral-200 hover:bg-background-200"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
