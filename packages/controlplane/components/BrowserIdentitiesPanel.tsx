"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { listBrowserIdentities, removeBrowserIdentity } from "@/lib/browser-connect";
import type { BrowserIdData } from "@/lib/browser-identity";
import { typeMeta } from "./browser-identity-meta";
import IdentityBackupPanel from "./IdentityBackupPanel";

/**
 * Enumerate, manage, and back up the VaultysIDs this browser holds.
 *
 * The counterpart to `BrowserIdentityPicker`, which lists the same identities in
 * order to *connect as* one. Here you are already signed in, so there is nothing
 * to pick — the list exists to answer "what is actually stored in this browser,
 * and is any of it worth keeping".
 */
export default function BrowserIdentitiesPanel({ currentDid }: { currentDid: string }) {
  const [identities, setIdentities] = useState<BrowserIdData[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);

  // localStorage is read in an effect, never during render: this mounts from a
  // Server Component page, so a render-time read would disagree with the
  // server's empty output and produce a hydration mismatch.
  const refresh = useCallback(() => setIdentities(listBrowserIdentities()), []);
  useEffect(refresh, [refresh]);

  function handleDelete(did: string) {
    // Two-step rather than a confirm dialog. Deleting a browser key is
    // irreversible and there is no server-side copy to recover from — the whole
    // reason the backup section below exists — so a single stray click should
    // not be able to do it.
    if (confirming !== did) {
      setConfirming(did);
      return;
    }
    removeBrowserIdentity(did);
    setConfirming(null);
    refresh();
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <h2 className="flex items-baseline gap-2 text-sm font-medium text-foreground">
            Stored in this browser
            <span className="font-mono text-xs tabular-nums text-foreground-500">
              {identities.length}
            </span>
          </h2>
          <p className="mt-1 text-xs leading-5 text-foreground-500">
            These VaultysIDs live in this browser&apos;s <code className="font-mono">localStorage</code> and nowhere
            else. Clearing site data destroys them, and nothing on the server can bring them
            back — which is what the backup below is for.
          </p>
        </div>

        {identities.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-200 px-4 py-6 text-sm text-foreground-500">
            No identities stored in this browser. Restoring a backup below adds them back
          </p>
        ) : (
          <ul className="divide-y divide-neutral-200/60 overflow-hidden rounded-xl border border-neutral-200/60 bg-background-100">
            {identities.map((identity) => {
              const meta = typeMeta(identity.type);
              const isCurrent = identity.did === currentDid;
              const isConfirming = confirming === identity.did;
              return (
                <li key={identity.did} className="group flex items-center gap-3 px-4 py-3">
                  <meta.icon className="h-4 w-4 shrink-0 text-foreground-500" strokeWidth={1.5} />

                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-xs text-foreground">{identity.did}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-foreground-500">
                      <span>{meta.label}</span>
                      {isCurrent && (
                        <Badge tone="positive">this session</Badge>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDelete(identity.did)}
                    onBlur={() => isConfirming && setConfirming(null)}
                    title={
                      isCurrent
                        ? "This is the identity you are signed in as — deleting it means you cannot sign in as it again from this browser"
                        : "Forget this identity"
                    }
                    className={
                      isConfirming
                        ? "shrink-0 rounded-lg border border-danger-200 bg-danger-50 px-2 py-1 text-xs font-medium text-danger-700"
                        : "shrink-0 rounded-lg p-2 text-foreground-500 transition-colors hover:bg-background-200 hover:text-danger-700"
                    }
                  >
                    {isConfirming ? "Delete permanently?" : <Trash2 className="h-4 w-4" strokeWidth={1.5} />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="border-t border-neutral-200/60 pt-6">
        <IdentityBackupPanel identities={identities} onIdentitiesChanged={refresh} />
      </div>
    </div>
  );
}
