"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ShieldOff, ShieldCheck } from "lucide-react";
import { armKillSwitchAction, disarmKillSwitchAction } from "@/app/admin/kill-switch/actions";

/**
 * Arm/disarm control for a kill switch, shared by `/admin/settings` (the
 * org-wide one) and a workspace's detail page — one component so the two cannot
 * describe the same mechanism differently.
 *
 * A Client Component for the same reason `DeleteWorkspacePanel` is one: it
 * awaits the action so a refusal reaches the admin, rather than letting a thrown
 * Server Action error be redacted in a production build.
 *
 * The copy states the two things an admin cannot see from here and would
 * otherwise have to assume: that no certificate is revoked (so this is
 * reversible, unlike the revoke button elsewhere in the console), and that
 * humans are exempt (so they are not about to lock themselves out).
 */
export default function KillSwitchPanel({
  scope,
  workspaceId,
  workspaceName,
  armed,
}: {
  scope: "global" | "workspace";
  workspaceId?: string;
  workspaceName?: string;
  armed: { reason: string; armedBy: string; armedAt: string } | null;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const what = scope === "global" ? "every non-human Actor in the organization" : `every non-human Actor in ${workspaceName ?? "this workspace"}`;

  function submit(action: (fd: FormData) => Promise<void>, extra: Record<string, string> = {}) {
    const formData = new FormData();
    formData.set("scope", scope);
    if (workspaceId) formData.set("workspaceId", workspaceId);
    for (const [k, v] of Object.entries(extra)) formData.set(k, v);
    setError(null);
    startTransition(async () => {
      try {
        await action(formData);
        setOpen(false);
        setReason("");
        setTyped("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  if (armed) {
    return (
      <section className="space-y-3 border border-danger-200 rounded-xl bg-danger-100/50 p-4 max-w-lg">
        <h2 className="text-sm font-semibold text-danger-700 flex items-center gap-1.5">
          <ShieldOff className="w-3.5 h-3.5" />
          Kill switch ARMED
        </h2>
        <dl className="text-xs text-foreground-600 space-y-1">
          <div>
            <dt className="inline font-medium">Reason: </dt>
            <dd className="inline">{armed.reason}</dd>
          </div>
          <div>
            <dt className="inline font-medium">Armed by: </dt>
            <dd className="inline font-mono break-all">{armed.armedBy}</dd>
          </div>
          <div>
            <dt className="inline font-medium">Since: </dt>
            <dd className="inline">{new Date(armed.armedAt).toLocaleString()}</dd>
          </div>
        </dl>
        <p className="text-xs text-foreground-600">
          {what} is suspended: every status check reports their certificates revoked, their
          connections are refused, and no new grant can be issued. <strong>No certificate was
          actually revoked</strong> — disarming restores everything immediately, with no
          re-issuance and no new handshake.
        </p>
        {error && (
          <p role="alert" className="text-xs text-danger-700 bg-danger-100 border border-danger-200 rounded-lg px-3 py-2 flex gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </p>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => submit(disarmKillSwitchAction)}
          className="text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-success-600 text-white hover:bg-success-700 disabled:opacity-40"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          {pending ? "Disarming…" : "Disarm"}
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-3 border border-danger-200 rounded-xl bg-danger-100/30 p-4 max-w-lg">
      <h2 className="text-sm font-semibold text-danger-700 flex items-center gap-1.5">
        <ShieldOff className="w-3.5 h-3.5" />
        {scope === "global" ? "Emergency kill switch" : "Workspace kill switch"}
      </h2>
      <p className="text-xs text-foreground-600">
        Immediately suspends {what}: their certificates resolve as revoked on every status check,
        their live connections are closed, and their reconnections are refused until you disarm.
        Humans are never affected, so this console stays usable.{" "}
        <strong>Nothing is revoked</strong> — the ledger is untouched and disarming restores
        access at once.
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-danger-200 text-danger-700 hover:bg-danger-100"
        >
          <ShieldOff className="w-3.5 h-3.5" />
          Arm kill switch…
        </button>
      ) : (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit(armKillSwitchAction, { reason, confirm: typed });
          }}
        >
          <label className="block text-xs text-foreground-600">
            Reason (recorded in the audit log and sent to the affected Actors)
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoComplete="off"
              className="mt-1 w-full max-w-sm text-sm rounded-lg border border-neutral-200 bg-background-50 px-2 py-1.5"
            />
          </label>
          <label className="block text-xs text-foreground-600">
            Type <code className="font-mono text-danger-700">ARM</code> to confirm
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="mt-1 w-full max-w-sm text-sm rounded-lg border border-neutral-200 bg-background-50 px-2 py-1.5"
            />
          </label>
          {error && (
            <p role="alert" className="text-xs text-danger-700 bg-danger-100 border border-danger-200 rounded-lg px-3 py-2 flex gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={pending || typed !== "ARM" || !reason.trim()}
              className="text-xs px-3 py-1.5 rounded-lg bg-danger-600 text-white hover:bg-danger-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {pending ? "Arming…" : "Arm now"}
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
