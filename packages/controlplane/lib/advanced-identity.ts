"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * "Advanced identity management" — the opt-in that reveals multi-VaultysID
 * controls (picking between stored keys, choosing a key type, backup/restore,
 * the Browser keys tab on /identity).
 *
 * Those controls exist because one browser standing in for several humans is
 * genuinely useful — testing as an admin and then as a freshly invited user, or
 * keeping a passkey and a FIDO2 key side by side. They are also the wrong first
 * thing to show somebody who just wants to sign in: the ordinary path needs no
 * choice at all, since `ensureBrowserIdentity()` reuses or creates the one key
 * this browser needs.
 *
 * Per-browser rather than per-account, and stored in `localStorage` rather than
 * on the Actor, because what it governs *is* per-browser: which keys this
 * particular device holds. It carries no authority — everything it reveals is
 * reachable by a determined user anyway — so there is nothing here to enforce
 * server-side.
 */
const KEY = "vaultysclaw:advancedIdentity";

export function readAdvancedIdentity(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(KEY) === "1";
}

export function writeAdvancedIdentity(on: boolean): void {
  if (typeof localStorage === "undefined") return;
  if (on) localStorage.setItem(KEY, "1");
  else localStorage.removeItem(KEY);
}

/**
 * Read/write the flag from a component.
 *
 * Always starts `false` and reads the real value in an effect, never during
 * render — several of the consumers mount from a Server Component page, where a
 * render-time `localStorage` read would disagree with the server's output and
 * produce a hydration mismatch. The practical cost is one frame with the
 * advanced controls hidden, which is the correct way round to be wrong.
 */
export function useAdvancedIdentity(): [boolean, (on: boolean) => void] {
  const [advanced, setAdvanced] = useState(false);
  useEffect(() => setAdvanced(readAdvancedIdentity()), []);

  const update = useCallback((on: boolean) => {
    writeAdvancedIdentity(on);
    setAdvanced(on);
  }, []);

  return [advanced, update];
}
