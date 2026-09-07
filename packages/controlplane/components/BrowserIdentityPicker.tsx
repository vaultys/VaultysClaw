"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Download, Plus, Trash2, X } from "lucide-react";
import {
  generateBrowserIdentity,
  listBrowserIdentities,
  removeBrowserIdentity,
  type BrowserIdData,
  type BrowserIdentityType,
} from "@/lib/browser-connect";
import IdentityBackupPanel from "./IdentityBackupPanel";
import { TYPE_META, TYPE_ORDER, typeMeta } from "./browser-identity-meta";


type View = "list" | "choose-type" | "backup";

/**
 * Advanced identity management: pick which VaultysID held by this browser to connect as, or
 * generate a fresh one of a given type — makes it possible to act as several different humans
 * (an admin, then a freshly invited user) from one browser without destroying the previous key
 * first. Revealed only by the advanced-mode switch (`lib/advanced-identity.ts`); the ordinary
 * sign-in and invite paths never ask, they just use `ensureBrowserIdentity()`. The four generation
 * types mirror packages/control-plane's `SecurityTypeSelector` (software/passkey/hardware are real
 * working code there — genuine `navigator.credentials.create()` calls, not stubs) plus a fourth,
 * post-quantum option neither control-plane app actually wired up before now (see
 * lib/browser-connect.ts's doc comment). A full-screen modal (portaled to document.body) rather
 * than an inline dropdown — this is a deliberate, occasional action, not something that needs to
 * compete for space with the QR code underneath.
 */export default function BrowserIdentityPicker({
  onSelect,
}: {
  onSelect: (identity: BrowserIdData) => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("list");
  const [identities, setIdentities] = useState<BrowserIdData[]>([]);
  const [busy, setBusy] = useState<BrowserIdentityType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function close() {
    setOpen(false);
    setView("list");
    setError(null);
  }

  async function handleGenerate(type: BrowserIdentityType) {
    setBusy(type);
    setError(null);
    try {
      const identity = await generateBrowserIdentity(type);
      onSelect(identity);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate identity");
    } finally {
      setBusy(null);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setIdentities(listBrowserIdentities());
          setOpen(true);
        }}
        className="text-xs text-foreground-400 hover:text-foreground-600 transition-colors underline underline-offset-2"
      >
        Use a different VaultysID
      </button>
    );
  }

  // Portaled to document.body rather than rendered in place — an ancestor on the login/invite
  // pages has a completed CSS animation (animate-fade-in-up), and any resolved `transform` value,
  // even an identity one left behind by a finished animation, creates a containing block for
  // `position: fixed` — without the portal this modal would be confined to that ancestor's box
  // instead of covering the real viewport.
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between border-b border-neutral-200/60 px-6 py-5 sm:px-10">
        <div className="flex items-center gap-3">
          {view !== "list" && (
            <button
              type="button"
              onClick={() => {
                setView("list");
                setError(null);
              }}
              className="rounded-lg p-1.5 text-foreground-400 transition-colors hover:bg-background-200 hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {view === "list"
                ? "VaultysIDs in this browser"
                : view === "backup"
                  ? "Back up & restore"
                  : "Choose a key type"}
            </h2>
            <p className="mt-0.5 text-sm text-foreground-500">
              {view === "list"
                ? "Choose which one to connect as."
                : view === "backup"
                  ? "These files hold private keys, so they are always encrypted."
                  : "Real generation — passkey/hardware trigger an actual browser prompt."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={close}
          className="rounded-lg p-2 text-foreground-400 transition-colors hover:bg-background-200 hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="mx-auto w-full max-w-xl flex-1 overflow-y-auto px-6 py-8 sm:px-10">
        {error && (
          <div className="mb-4 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
            {error}
          </div>
        )}

        {view === "list" ? (
          <>
            <div className="space-y-1">
              {identities.length === 0 && (
                <p className="px-3 py-10 text-center text-sm text-foreground-400">
                  No identities stored yet — generate one below.
                </p>
              )}
              {identities.map((identity) => {
                const meta = typeMeta(identity.type);
                return (
                  <div
                    key={identity.did}
                    className="group flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-background-100"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-600">
                      <meta.icon className="h-4.5 w-4.5" />
                    </span>
                    <button
                      type="button"
                      onClick={() => onSelect(identity)}
                      title={identity.did}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate font-mono text-sm text-foreground group-hover:text-primary-600">
                        {identity.did}
                      </div>
                      <div className="text-xs text-foreground-400">{meta.label}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        removeBrowserIdentity(identity.did);
                        setIdentities(listBrowserIdentities());
                      }}
                      title="Forget this identity"
                      className="shrink-0 rounded-lg p-2 text-foreground-300 opacity-0 transition-colors hover:bg-danger-50 hover:text-danger-600 group-hover:opacity-100"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setView("choose-type")}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 py-3 text-sm font-medium text-foreground-700 transition-colors hover:border-primary-400 hover:bg-primary-50 hover:text-primary-600"
            >
              <Plus className="h-4 w-4" />
              Generate new identity
            </button>

            <button
              type="button"
              onClick={() => {
                setView("backup");
                setError(null);
              }}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium text-foreground-500 transition-colors hover:bg-background-100 hover:text-foreground"
            >
              <Download className="h-4 w-4" />
              Back up or restore identities
            </button>
          </>
        ) : view === "backup" ? (
          <IdentityBackupPanel
            identities={identities}
            onIdentitiesChanged={() => setIdentities(listBrowserIdentities())}
          />
        ) : (
          <div className="space-y-2">
            {TYPE_ORDER.map((type) => {
              const meta = TYPE_META[type];
              const isBusy = busy === type;
              return (
                <button
                  key={type}
                  type="button"
                  disabled={busy !== null}
                  onClick={() => handleGenerate(type)}
                  className="flex w-full items-center gap-4 rounded-xl border border-neutral-200 p-4 text-left transition-colors hover:border-primary-400 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-600">
                    {isBusy ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-400 border-t-transparent" />
                    ) : (
                      <meta.icon className="h-4.5 w-4.5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground">{meta.label}</div>
                    <div className="text-xs text-foreground-500">{meta.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
