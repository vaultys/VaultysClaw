"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { signIn } from "next-auth/react";
import {
  connectWithBrowserIdentity,
  ensureBrowserIdentity,
  type BrowserIdData,
} from "@/lib/browser-connect";
import BrowserIdentityPicker from "@/components/BrowserIdentityPicker";
import { useAdvancedIdentity } from "@/lib/advanced-identity";

const WALLET_URL = process.env.NEXT_PUBLIC_WALLET_URL || "https://wallet.vaultys.net";

type InvalidReason = "not_found" | "expired" | "redeemed";
type Phase =
  | "checking"
  | "invalid"
  | "loading"
  | "waiting"
  | "browser-connecting"
  | "success"
  | "failure";
/** Which transport is proving a VaultysID: a wallet app scanning the QR, or a
 *  key this browser holds. */
type Mode = "wallet" | "browser";

/**
 * Redemption page for a single-use human invite (packages/controlplane/CLAUDE.md "Human onboarding
 * via invite") — a close cousin of app/login/page.tsx, sharing the exact same Challenger crypto and
 * both transports, just always in "register" mode and scoped to one invitation token. The
 * pre-flight check against /api/public/invite/[token] runs BEFORE any crypto exchange starts, so a
 * dead link fails immediately with a specific reason instead of silently minting a stray account —
 * the bug this design deliberately fixes vs. packages/control-plane's equivalent.
 *
 * **The browser-key transport is not dev-gated here**, unlike /login's bootstrap branch. Both
 * invite-scoped routes require this page's unguessable single-use token, so there is no anonymous
 * caller to protect against — `lib/browser-bootstrap.ts` explains the distinction. That matters
 * because an SSO binding lands here (`?sso=1`, minted by `lib/sso.ts`): that person has just proved
 * who they are at their own IdP and holds no VaultysID at all, so a QR code demanding a wallet app
 * they have never installed is a dead end rather than a step — which is exactly where SSO used to
 * stop working outside dev. For them this page mints or reuses a browser-held key on arrival and
 * finishes on its own.
 */
export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  // `?sso=1` marks an invitation minted by an unbound SSO login (lib/sso.ts) rather
  // than one an admin sent. It changes both the copy — "you've been invited" is the
  // wrong thing to tell someone who just authenticated with their own corporate
  // account and is mid-flow — and the default transport, per the note above.
  const isSsoBinding = useSearchParams().get("sso") === "1";
  const [phase, setPhase] = useState<Phase>("checking");
  const [mode, setMode] = useState<Mode>(isSsoBinding ? "browser" : "wallet");
  const [invalidReason, setInvalidReason] = useState<InvalidReason>("not_found");
  const [inviteeName, setInviteeName] = useState<string>();
  const [qrUrl, setQrUrl] = useState<string>();
  const [advanced] = useAdvancedIdentity();
  const cancelled = useRef(false);

  const pollAndSignIn = useCallback(async (pollToken: string, key: string) => {
    for (let i = 0; i < 180 && !cancelled.current; i++) {
      const pollRes = await fetch(`/api/public/user/listen/${pollToken}`);
      const { status } = await pollRes.json();
      // Re-checked after the await: a transport switch mid-request must not let an
      // abandoned exchange sign the browser in or overwrite the new one's phase.
      if (cancelled.current) return;
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

  const startWallet = useCallback(async () => {
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

  /** `identity` omitted — the ordinary case — means "whichever key this browser
   *  already holds, or a fresh software one if it holds none". Only the advanced
   *  picker ever names a specific one. Resolved *before* asking the server for a
   *  certificate, so a WebAuthn prompt the person cancels doesn't leave a dangling
   *  exchange to time out. */
  const startBrowser = useCallback(
    async (identity?: BrowserIdData) => {
      setPhase("browser-connecting");
      cancelled.current = false;

      let chosen: BrowserIdData;
      try {
        chosen = identity ?? (await ensureBrowserIdentity());
      } catch {
        setPhase("failure");
        return;
      }
      if (cancelled.current) return;

      const res = await fetch(`/api/public/invite/${token}/connect`);
      const { token: pollToken, key } = await res.json();

      // Same fire-and-forget-through-polling shape as /login — a rejection here surfaces via the
      // poll below (the server marks the cert failed) rather than directly.
      void connectWithBrowserIdentity(key, chosen).catch(() => {});
      await pollAndSignIn(pollToken, key);
    },
    [token, pollAndSignIn]
  );

  /** Switching transport abandons whatever exchange is in flight. The old
   *  `AuthCertificate` is left to expire — it is single-use and keyed by a
   *  connection hash nobody else holds, so there is nothing to clean up. */
  const switchMode = useCallback(
    (next: Mode) => {
      cancelled.current = true;
      setQrUrl(undefined);
      setMode(next);
      if (next === "wallet") void startWallet();
      else void startBrowser();
    },
    [startWallet, startBrowser]
  );

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
      // An SSO binding starts on the browser-key transport (see the page comment);
      // an admin's invite still leads with the wallet QR.
      if (isSsoBinding) void startBrowser();
      else void startWallet();
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

  const retry = () => (mode === "wallet" ? startWallet() : startBrowser());

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-sm w-full text-center space-y-6">
        <div className="flex flex-col items-center gap-3">
          <span className="w-11 h-11 bg-primary-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary-600/20 text-white text-lg font-bold">
            V
          </span>
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              {isSsoBinding
                ? inviteeName
                  ? `Almost there, ${inviteeName}`
                  : "One more step"
                : inviteeName
                  ? `You've been invited, ${inviteeName}`
                  : "You've been invited to VaultysClaw"}
            </h1>
            {phase !== "invalid" && (
              <p className="text-sm text-foreground-500 mt-1">
                {isSsoBinding
                  ? "Your sign-in was verified. We're linking the VaultysID your account is built on — it's the identity every permission you're given is attached to."
                  : mode === "wallet"
                    ? "Open your VaultysID app and scan the QR code below to accept"
                    : "Accepting with a VaultysID held by this browser"}
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

        {phase === "browser-connecting" ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-foreground-700 font-medium">Setting up your VaultysID…</p>
            <p className="text-xs text-foreground-400">
              The key is generated in this browser and never leaves it. Back it up from My identity
              once you&apos;re in — nothing on the server can recover it.
            </p>
          </div>
        ) : (
          mode === "wallet" &&
          (phase === "loading" ||
            phase === "waiting" ||
            phase === "success" ||
            phase === "failure") && (
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
              onClick={() => void retry()}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Try again
            </button>
          </div>
        )}

        {/* Both transports stay reachable: someone who does hold a wallet should be
            able to bind that identity rather than a browser key, and someone whose
            wallet isn't to hand shouldn't be stuck staring at a QR code. */}
        {phase !== "checking" && phase !== "invalid" && phase !== "success" && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => switchMode(mode === "wallet" ? "browser" : "wallet")}
              className="text-xs text-foreground-400 hover:text-foreground-600 transition-colors underline underline-offset-2"
            >
              {mode === "wallet"
                ? "Use a VaultysID in this browser instead"
                : "Scan with my VaultysID app instead"}
            </button>
            {advanced && (
              <div>
                <BrowserIdentityPicker
                  onSelect={(identity) => {
                    cancelled.current = true;
                    setMode("browser");
                    void startBrowser(identity);
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
