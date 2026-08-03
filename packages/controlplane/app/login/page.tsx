"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { signIn } from "next-auth/react";

const WALLET_URL = process.env.NEXT_PUBLIC_WALLET_URL || "https://wallet.vaultys.net";

type Phase = "loading" | "waiting" | "success" | "failure";

/**
 * Passwordless VaultysId QR login — the only login mechanism
 * (docs/REBUILD_ARCHITECTURE.md §1: no username/password fallback).
 * Scan with the VaultysId wallet app; this page just displays the QR and
 * polls for completion.
 */
export default function LoginPage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [qrUrl, setQrUrl] = useState<string>();
  const cancelled = useRef(false);

  const start = useCallback(async () => {
    setPhase("loading");
    cancelled.current = false;

    const res = await fetch("/api/public/user/p2p-connect");
    const { connectionString, token, key, serverDid } = await res.json();

    const didParam = serverDid ? `&did=${encodeURIComponent(serverDid)}` : "";
    setQrUrl(`${WALLET_URL}/#${connectionString}&protocol=p2p&service=auth${didParam}`);
    setPhase("waiting");

    for (let i = 0; i < 180 && !cancelled.current; i++) {
      const pollRes = await fetch(`/api/public/user/listen/${token}`);
      const { status } = await pollRes.json();
      if (status === 2) {
        const signInRes = await signIn("credentials", { token: key, redirect: false });
        if (signInRes?.ok) {
          setPhase("success");
          window.location.href = "/";
        } else {
          setPhase("failure");
        }
        return;
      }
      if (status === -2) {
        setPhase("failure");
        return;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (!cancelled.current) setPhase("failure");
  }, []);

  useEffect(() => {
    start();
    return () => {
      cancelled.current = true;
    };
  }, [start]);

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-sm w-full text-center space-y-6">
        <div className="flex flex-col items-center gap-3">
          <span className="w-11 h-11 bg-primary-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary-600/20 text-white text-lg font-bold">
            V
          </span>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Sign in with VaultysID</h1>
            <p className="text-sm text-foreground-500 mt-1">
              Open your VaultysID app and scan the QR code below
            </p>
          </div>
        </div>

        <div className="flex justify-center">
          {qrUrl ? (
            <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-sm">
              <QRCodeSVG value={qrUrl} size={200} />
            </div>
          ) : (
            <div className="w-52 h-52 rounded-xl border border-neutral-200 bg-background-100 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {phase === "waiting" && (
          <div className="flex items-center justify-center gap-2 text-sm text-foreground-500">
            <div className="w-3 h-3 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
            Waiting for scan…
          </div>
        )}
        {phase === "failure" && (
          <div className="space-y-3">
            <p className="text-sm text-danger-600">Connection failed or timed out.</p>
            <button
              onClick={start}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
