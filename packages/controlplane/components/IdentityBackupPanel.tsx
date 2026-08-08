"use client";

import { useState } from "react";
import { Download, ShieldAlert, Upload } from "lucide-react";
import { importDevIdentities } from "@/lib/browser-connect";
import type { BrowserIdData } from "@/lib/dev-identity";
import {
  MIN_PASSPHRASE_LENGTH,
  backupFilename,
  createBackup,
  openBackup,
  parseBackup,
} from "@/lib/identity-backup";

/**
 * Export and restore the dev-mode VaultysIDs held in this browser.
 *
 * Extracted from `DevIdentityPicker` so the same forms serve both the logged-out
 * login page and the signed-in identity page. Backing up only from `/login` is
 * the wrong shape: the moment you have something worth keeping you are usually
 * signed in, and the feature was unreachable there.
 *
 * The passphrases are self-contained state, but the identity list is *not*: it
 * comes from the parent. An earlier version kept its own copy read from
 * localStorage, and it promptly drifted — deleting an identity in the list above
 * left this section still offering to back up the old count. Two components
 * holding the same fact will always find a way to disagree; the parent owns it,
 * and `onIdentitiesChanged` asks the parent to re-read after a restore.
 */
export default function IdentityBackupPanel({
  identities,
  onIdentitiesChanged,
}: {
  identities: BrowserIdData[];
  onIdentitiesChanged?: () => void;
}) {
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  // Deliberately separate from `passphrase`: one shared field would prefill the
  // export passphrase into the restore form, where it is the wrong secret and
  // produces a misleading "wrong passphrase".
  const [restorePassphrase, setRestorePassphrase] = useState("");
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function handleExport() {
    setError(null);
    setNotice(null);
    if (passphrase !== confirmPassphrase) {
      setError("The two passphrases do not match.");
      return;
    }
    setWorking(true);
    try {
      const backup = await createBackup(identities, passphrase);
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = backupFilename();
      a.click();
      URL.revokeObjectURL(url);
      setNotice(
        `Backed up ${backup.identityCount} ${backup.identityCount === 1 ? "identity" : "identities"}. ` +
          `Without this passphrase the file is unrecoverable — there is no reset.`
      );
      setPassphrase("");
      setConfirmPassphrase("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create the backup");
    } finally {
      setWorking(false);
    }
  }

  async function handleImport() {
    setError(null);
    setNotice(null);
    if (!restoreFile) {
      setError("Choose a backup file first.");
      return;
    }
    setWorking(true);
    try {
      const restored = await openBackup(parseBackup(await restoreFile.text()), restorePassphrase);
      const { added, alreadyPresent } = importDevIdentities(restored);
      onIdentitiesChanged?.();
      // A restore that did nothing looks exactly like one that worked, so say
      // which happened rather than just "done".
      setNotice(
        added === 0
          ? `Nothing to restore — all ${alreadyPresent} ${alreadyPresent === 1 ? "identity was" : "identities were"} already in this browser.`
          : `Restored ${added} ${added === 1 ? "identity" : "identities"}` +
              (alreadyPresent > 0 ? `, ${alreadyPresent} already present.` : ".")
      );
      setRestorePassphrase("");
      setRestoreFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore the backup");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="space-y-8">
      {error && (
        <p className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-lg border border-success-200 bg-success-50 px-3 py-2 text-sm text-success-700">
          {notice}
        </p>
      )}

      <p className="flex gap-2 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2.5 text-xs text-warning-800">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          A backup contains the <strong>private keys</strong> of the identities in this browser. It is
          always encrypted with a passphrase you choose, and that passphrase is never stored or
          recoverable. Only browser-held identities are covered — a key held by the wallet app never
          leaves it, so there is nothing here to export for one.
        </span>
      </p>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-medium text-foreground">Back up</h3>
          <p className="text-xs text-foreground-500">
            Downloads all {identities.length} {identities.length === 1 ? "identity" : "identities"} as one encrypted file.
          </p>
        </div>

        <input
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          placeholder={`Passphrase (at least ${MIN_PASSPHRASE_LENGTH} characters)`}
          autoComplete="new-password"
          className="w-full rounded-lg border border-neutral-200 bg-background px-3 py-2 text-sm text-foreground"
        />
        <input
          type="password"
          value={confirmPassphrase}
          onChange={(e) => setConfirmPassphrase(e.target.value)}
          placeholder="Confirm passphrase"
          autoComplete="new-password"
          className="w-full rounded-lg border border-neutral-200 bg-background px-3 py-2 text-sm text-foreground"
        />

        <button
          type="button"
          disabled={working || identities.length === 0 || passphrase.length === 0}
          onClick={handleExport}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Download className="h-4 w-4" />
          Download encrypted backup
        </button>
      </section>

      <section className="space-y-3 border-t border-neutral-200/60 pt-6">
        <div>
          <h3 className="text-sm font-medium text-foreground">Restore</h3>
          <p className="text-xs text-foreground-500">
            Adds the identities in a backup to this browser. Nothing already here is removed or
            overwritten.
          </p>
        </div>

        <input
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            setRestoreFile(e.target.files?.[0] ?? null);
            setError(null);
            setNotice(null);
          }}
          className="w-full rounded-lg border border-neutral-200 bg-background px-3 py-2 text-sm text-foreground-600 file:mr-3 file:rounded-md file:border-0 file:bg-background-200 file:px-3 file:py-1 file:text-sm file:text-foreground-700"
        />
        <input
          type="password"
          value={restorePassphrase}
          onChange={(e) => setRestorePassphrase(e.target.value)}
          placeholder="Backup passphrase"
          autoComplete="off"
          className="w-full rounded-lg border border-neutral-200 bg-background px-3 py-2 text-sm text-foreground"
        />

        <button
          type="button"
          disabled={working || !restoreFile || restorePassphrase.length === 0}
          onClick={handleImport}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-background-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Upload className="h-4 w-4" />
          Restore from backup
        </button>
      </section>
    </div>
  );
}
