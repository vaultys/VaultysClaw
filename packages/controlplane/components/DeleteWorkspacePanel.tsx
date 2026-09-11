"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2 } from "lucide-react";
import { deleteWorkspaceAction } from "@/app/admin/workspaces/actions";

/**
 * The workspace detail page's delete control — the same shape, and for the same
 * reasons, as `DeleteActorPanel`: a Client Component that awaits the action's
 * return value (a thrown Server Action error is redacted in a production build,
 * so the reason a deletion was refused would never reach the admin), and a typed
 * name confirmation because what this does is not local to the row.
 *
 * The counts are stated before the field can be typed, because they are the part
 * an admin cannot see from the page they are on: deleting a workspace revokes
 * every certificate scoped to it — on hosts that enforce offline and may not be
 * connected right now — and unfiles every Actor assigned to it.
 */
export default function DeleteWorkspacePanel({
  id,
  name,
  actorCount,
  scopedCertificateCount,
}: {
  id: string;
  name: string;
  actorCount: number;
  scopedCertificateCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <section className="space-y-3 border border-danger-200 rounded-xl bg-danger-100/30 p-4 max-w-lg">
      <h2 className="text-sm font-semibold text-danger-700 flex items-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5" />
        Delete this workspace
      </h2>

      <p className="text-xs text-foreground-600">
        {scopedCertificateCount > 0 ? (
          <>
            This will{" "}
            <strong>
              revoke {scopedCertificateCount} active certificate
              {scopedCertificateCount === 1 ? "" : "s"} scoped to this workspace
            </strong>
            . Any host holding one stops being authorized at its next status check — including
            hosts that enforce offline and are not connected right now.{" "}
          </>
        ) : (
          <>No active certificate is scoped to this workspace, so nothing running loses access. </>
        )}
        {actorCount > 0 ? (
          <>
            {actorCount} actor{actorCount === 1 ? "" : "s"} assigned here{" "}
            {actorCount === 1 ? "becomes" : "become"} unassigned; no Actor is deleted.{" "}
          </>
        ) : (
          <>No actor is assigned here. </>
        )}
        The audit trail is kept, and the deletion records how many grants it revoked.
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-danger-200 text-danger-700 hover:bg-danger-100"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete workspace…
        </button>
      ) : (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData();
            formData.set("id", id);
            formData.set("confirmName", typed);
            startTransition(async () => {
              const result = await deleteWorkspaceAction(formData);
              if (result.error) {
                setError(result.error);
                return;
              }
              // This page no longer has a row behind it.
              router.push("/admin/workspaces");
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
