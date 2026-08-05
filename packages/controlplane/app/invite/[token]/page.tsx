"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { signIn } from "next-auth/react";
import { connectWithoutApp, type BrowserIdData } from "@/lib/browser-connect";
import DevIdentityPicker from "@/components/DevIdentityPicker";

const WALLET_URL = process.env.NEXT_PUBLIC_WALLET_URL || "https://wallet.vaultys.net";
// process.env.NODE_ENV is inlined at build time by Next.js, including in client bundles —
// this is never a runtime env lookup, so it's safe to gate UI on it directly.
const DEV_LOGIN_ENABLED = process.env.NODE_ENV !== "production";

type InvalidReason = "not_found" | "expired" | "redeemed";
type Phase = "checking" | "invalid" | "loading" | "waiting" | "dev-connecting" | "success" | "failure";

/**
 * Redemption page for a single-use human invite (packages/controlplane/CLAUDE.md "Human onboarding
 * via invite") — a close cousin of app/login/page.tsx, sharing the exact same Challenger crypto and
 * QR/dev-mode transports, just always in "register" mode and scoped to one invitation token. The
 * pre-flight check against /api/public/invite/[token] runs BEFORE any crypto exchange starts, so a
 * dead link fails immediately with a specific reason instead of silently minting a stray account —
 * the bug this design deliberately fixes vs. packages/control-plane's equivalent.
 */
export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [phase, setPhase] = useState<Phase>("checking");
  const [invalidReason, setInvalidReason] = useState<InvalidReason>("not_found");
  const [inviteeName, setInviteeName] = useState<string>();
  const [qrUrl, setQrUrl] = useState<string>();
  const cancelled = useRef(false);

  const pollAndSignIn = useCallback(async (pollToken: string, key: string) => {
    for (let i = 0; i < 180 && !cancelled.current; i++) {
      const pollRes = await fetch(`/api/public/user/listen/${pollToken}`);
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

  const start = useCallback(async () => {
    setPhase("loading");
    cancelled.current = false;

    const res = await fetch(`/api/public/invite/${token}/p2p-connect`);
    const { connectionString, token: pollToken, key, serverDid } = await res.json();

    // `service=auth` here (not "register") matches app/login/page.tsx's own QR deep link exactly —
    // whether this is a fresh registration is actually decided server-side by the AuthCertificate's
    // own `register` field, not by this string; `verifyProtocol` (lib/user-login-channel.ts) accepts
    // either value, but only "auth" has ever been exercised against a real wallet app.
    const didParam = serverDid ? `&did=${encodeURIComponent(serverDid)}` : "";
    setQrUrl(`${WALLET_URL}/#${connectionString}&protocol=p2p&service=auth${didParam}`);
    setPhase("waiting");

    await pollAndSignIn(pollToken, key);
  }, [token, pollAndSignIn]);

  const startDevLogin = useCallback(async (identity?: BrowserIdData) => {
    setPhase("dev-connecting");
    cancelled.current = false;

    const res = await fetch(`/api/public/invite/${token}/connect`);
    const { token: pollToken, key } = await res.json();

    // Same fire-and-forget-through-polling shape as /login — a rejection here surfaces via the
    // poll below (the server marks the cert failed) rather than directly.
    void connectWithoutApp(key, identity).catch(() => {});
    await pollAndSignIn(pollToken, key);
  }, [token, pollAndSignIn]);

  useEffect(() => {
    let ignore = false;
    (async () => {
      const res = await fetch(`/api/public/invite/${token}`);
      const data = await res.json();
      if (ignore) return;
      if (!data.valid) {
        setInvalidReason(data.reason ?? "not_found");
        setPhase("invalid");
        return;
      }
      setInviteeName(data.name);
      void start();
    })();
    return () => {
      ignore = true;
      cancelled.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const INVALID_COPY: Record<InvalidReason, string> = {
    not_found: "This invite link could not be found.",
    expired: "This invite link has expired.",
    redeemed: "This invite link has already been used.",
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-sm w-full text-center space-y-6">
        <div className="flex flex-col items-center gap-3">
          <span className="w-11 h-11 bg-primary-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary-600/20 text-white text-lg font-bold">
            V
          </span>
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              {inviteeName ? `You've been invited, ${inviteeName}` : "You've been invited to VaultysClaw"}
            </h1>
            {phase !== "invalid" && (
              <p className="text-sm text-foreground-500 mt-1">
                Open your VaultysID app and scan the QR code below to accept
              </p>
            )}
          </div>
        </div>

        {phase === "checking" && (
          <div className="w-8 h-8 mx-auto border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
        )}

        {phase === "invalid" && (
          <p className="text-sm text-danger-600">{INVALID_COPY[invalidReason]}</p>
        )}

        {phase === "dev-connecting" ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-foreground-700 font-medium">Connecting via this browser…</p>
            <p className="text-xs text-foreground-400">
              Authenticating with a software identity stored in this browser.
            </p>
          </div>
        ) : (
          (phase === "loading" || phase === "waiting" || phase === "success" || phase === "failure") && (
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
          )
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
