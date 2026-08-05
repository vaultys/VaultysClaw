"use client";

import { useState } from "react";
import {
  listStoredDevIdentities,
  removeStoredDevIdentity,
  type BrowserIdData,
} from "@/lib/browser-connect";

/**
 * Dev-mode only: lets a developer pick which previously used software VaultysID to connect as
 * (or generate a brand-new one), instead of always silently reusing/overwriting a single stored
 * identity — makes it easy to test as several different humans (e.g. an admin, then a freshly
 * invited user) without destroying the previous one first. `onSelect` mirrors
 * `connectWithoutApp`'s own `identity` parameter shape (a specific identity, or `"new"`).
 */
export default function DevIdentityPicker({
  onSelect,
}: {
  onSelect: (identity: BrowserIdData | "new") => void;
}) {
  const [open, setOpen] = useState(false);
  const [identities, setIdentities] = useState<BrowserIdData[]>([]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setIdentities(listStoredDevIdentities());
          setOpen(true);
        }}
        className="text-xs text-foreground-400 hover:text-foreground-600 transition-colors underline underline-offset-2"
      >
        Switch dev identity
      </button>
    );
  }

  return (
    <div className="text-xs text-left border border-neutral-200 rounded-lg p-3 bg-background-100 space-y-1.5 w-full max-w-xs mx-auto">
      <p className="text-foreground-400 uppercase tracking-wide text-[10px] font-medium">
        Dev identities
      </p>
      {identities.length === 0 && <p className="text-foreground-400">None stored yet.</p>}
      {identities.map((identity) => (
        <div key={identity.did} className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onSelect(identity)}
            title={identity.did}
            className="font-mono text-foreground-700 hover:text-primary-600 transition-colors truncate"
          >
            {identity.did.slice(0, 24)}…
          </button>
          <button
            type="button"
            onClick={() => {
              removeStoredDevIdentity(identity.did);
              setIdentities(listStoredDevIdentities());
            }}
            title="Forget this identity"
            className="text-foreground-300 hover:text-danger-600 transition-colors shrink-0"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onSelect("new")}
        className="text-primary-600 hover:underline"
      >
        + New identity
      </button>
    </div>
  );
}
