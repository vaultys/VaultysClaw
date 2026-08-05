"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { signIn } from "next-auth/react";
import { connectWithoutApp, completeCertificateRound, type BrowserIdData } from "@/lib/browser-connect";
import DevIdentityPicker from "@/components/DevIdentityPicker";

const WALLET_URL = process.env.NEXT_PUBLIC_WALLET_URL || "https://wallet.vaultys.net";
// process.env.NODE_ENV is inlined at build time by Next.js, including in client bundles —
// this is never a runtime env lookup, so it's safe to gate UI on it directly.
const DEV_LOGIN_ENABLED = process.env.NODE_ENV !== "production";

type Phase = "loading" | "waiting" | "dev-connecting" | "success" | "failure";

/**
 * Passwordless VaultysId login. The QR/wallet flow is the only mechanism in
 * production (docs/REBUILD_ARCHITECTURE.md §1: no username/password
 * fallback); in dev mode only, a second option lets the browser perform the
 * SRP handshake itself with a locally generated software identity — no
 * physical wallet needed. Same Challenger primitive either way, just a
 * different transport (lib/browser-connect.ts, HTTP instead of WebRTC).
 */
export default function LoginPage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [qrUrl, setQrUrl] = useState<string>();
  const cancelled = useRef(false);

  const pollAndSignIn = useCallback(async (token: string, key: string) => {
    for (let i = 0; i < 180 && !cancelled.current; i++) {
      const pollRes = await fetch(`/api/public/user/listen/${token}`);
      const { status, certRound } = await pollRes.json();
      if (status === 2) {
        if (certRound?.key) {
          // Double SRP (docs/CERTIFICATE_WEB_OF_TRUST.md §3.2b): this browser is the very first
          // human, so a second live exchange claims admin_console_access before sign-in proceeds.
          // Best-effort — a failure here isn't fatal to logging in, it just means no admin got
          // bootstrapped yet; the same offer reappears on the next fresh login since the
          // capability still won't exist.
          try {
            await completeCertificateRound(certRound.key);
          } catch (err) {
            console.error("Certificate round failed", err);
          }
        }
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

  const start = useCallback(async () => {
    setPhase("loading");
    cancelled.current = false;

    const res = await fetch("/api/public/user/p2p-connect");
    const { connectionString, token, key, serverDid } = await res.json();

    const didParam = serverDid ? `&did=${encodeURIComponent(serverDid)}` : "";
    setQrUrl(`${WALLET_URL}/#${connectionString}&protocol=p2p&service=auth${didParam}`);
    setPhase("waiting");

    await pollAndSignIn(token, key);
  }, [pollAndSignIn]);

  const startDevLogin = useCallback(async (identity?: BrowserIdData | "new") => {
    setPhase("dev-connecting");
    cancelled.current = false;

    const res = await fetch("/api/public/user/connect");
    const { token, key } = await res.json();

    // Errors here surface through the poll below (the server marks the cert
    // failed), so a rejection is intentionally swallowed rather than shown
    // directly — same behavior as the QR flow's failure path.
    void connectWithoutApp(key, identity).catch(() => {});
    await pollAndSignIn(token, key);
  }, [pollAndSignIn]);

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

        {phase === "dev-connecting" ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-foreground-700 font-medium">Connecting via this browser…</p>
            <p className="text-xs text-foreground-400">
              Authenticating with a software identity stored in this browser.
            </p>
          </div>
        ) : (
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
        )}

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

        {DEV_LOGIN_ENABLED && (phase === "waiting" || phase === "loading") && (
          <div className="space-y-2">
            <button
              onClick={() => startDevLogin()}
              className="text-xs text-foreground-400 hover:text-foreground-600 transition-colors underline underline-offset-2"
            >
              Connect without the app (dev mode)
            </button>
            <div>
              <DevIdentityPicker onSelect={(identity) => startDevLogin(identity)} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
