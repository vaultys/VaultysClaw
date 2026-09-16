"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTrustPolicyAction } from "@/app/admin/settings/actions";
import { updateWorkspaceTrustPolicyAction } from "@/app/admin/workspaces/actions";

/**
 * The trust-policy form, shared by `/admin/settings` (the org-wide defaults) and a
 * workspace's Settings tab — one component so the two scopes cannot describe the
 * same two knobs differently (docs/CERTIFICATE_WEB_OF_TRUST.md §5).
 *
 * In workspace scope each field inherits **independently**: a workspace can pin its
 * fail mode and keep following the org on staleness. Inheriting is a real, selectable
 * state rather than "leave the box empty", because `0` is a legitimate staple TTL — and
 * the strictest one there is ("force a live query every time"). An empty-means-inherit
 * input would quietly turn the strictest setting into the inherited one, which is the
 * wrong direction to be wrong in.
 *
 * A Client Component for the same reason `KillSwitchPanel` is one: it awaits the action
 * so a refusal reaches the admin instead of being redacted as a minified React error in
 * a production build. The staple-TTL input also has to appear and disappear with the
 * inherit/custom choice, which needs local state either way.
 */
export default function TrustPolicyForm({
  scope,
  workspaceId,
  value,
  inherited,
}: {
  scope: "global" | "workspace";
  workspaceId?: string;
  /** What is stored. In workspace scope, `null` on a field means "inherits". */
  value: { failMode: string | null; stapleTtlSeconds: number | null };
  /** The org-wide values a workspace inherits, shown in the inherit labels. Workspace scope only. */
  inherited?: { failMode: "open" | "closed"; stapleTtlSeconds: number };
}) {
  const perWorkspace = scope === "workspace";

  const [failMode, setFailMode] = useState<string>(
    value.failMode ?? (perWorkspace ? "inherit" : "closed")
  );
  const [stapleTtlMode, setStapleTtlMode] = useState<"inherit" | "custom">(
    perWorkspace && value.stapleTtlSeconds === null ? "inherit" : "custom"
  );
  const [stapleTtlSeconds, setStapleTtlSeconds] = useState<string>(
    String(value.stapleTtlSeconds ?? inherited?.stapleTtlSeconds ?? 0)
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const formData = new FormData();
    formData.set("failMode", failMode);
    if (perWorkspace) {
      formData.set("id", workspaceId ?? "");
      formData.set("stapleTtlMode", stapleTtlMode);
    }
    // The org form has no inherit option, so it always sends a number.
    if (!perWorkspace || stapleTtlMode === "custom") {
      formData.set("stapleTtlSeconds", stapleTtlSeconds);
    }

    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await (perWorkspace ? updateWorkspaceTrustPolicyAction : updateTrustPolicyAction)(formData);
        setSaved(true);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  const inheritedFailModeLabel =
    inherited?.failMode === "open" ? "open" : "closed";

  return (
    <form
      onSubmit={submit}
      className="border border-neutral-200/60 rounded-xl bg-background-100 p-4 space-y-4 max-w-md"
    >
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Fail mode</label>
        <select
          name="failMode"
          value={failMode}
          onChange={(e) => setFailMode(e.target.value)}
          className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
        >
          {perWorkspace && (
            <option value="inherit">
              Inherit from the organization ({inheritedFailModeLabel})
            </option>
          )}
          <option value="closed">Closed — refuse to act until a live check succeeds</option>
          <option value="open">
            Open — proceed on last-known-good status, else warn and continue
          </option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">
          Staple TTL (seconds)
        </label>
        {perWorkspace && (
          <select
            value={stapleTtlMode}
            onChange={(e) => setStapleTtlMode(e.target.value as "inherit" | "custom")}
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background mb-2"
          >
            <option value="inherit">
              Inherit from the organization ({inherited?.stapleTtlSeconds ?? 0}s)
            </option>
            <option value="custom">Set a value for this workspace</option>
          </select>
        )}
        {(!perWorkspace || stapleTtlMode === "custom") && (
          <input
            type="number"
            name="stapleTtlSeconds"
            min={0}
            value={stapleTtlSeconds}
            onChange={(e) => setStapleTtlSeconds(e.target.value)}
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
          />
        )}
        <p className="text-xs text-foreground-400 mt-1">
          0 forces a live query every time. A positive value lets a verifier accept a signed
          status response presented within that window instead. An interception point
          (<span className="font-mono">proxy</span>, <span className="font-mono">harness</span>)
          keeps the value in its own config — it decides offline and cannot run a live query —
          but the fail mode above still applies to it.
        </p>
      </div>

      {error && <p className="text-xs text-danger-600">{error}</p>}
      {saved && !error && <p className="text-xs text-success-700">Saved.</p>}

      <button
        type="submit"
        disabled={pending}
        className="px-4 py-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
      >
        {pending ? "Saving…" : "Save trust policy"}
      </button>
    </form>
  );
}
