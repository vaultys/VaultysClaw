"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { signIn } from "next-auth/react";
import { ShieldCheck, Fingerprint, ScrollText, KeyRound } from "lucide-react";
import { connectWithoutApp, completeCertificateRound, type BrowserIdData } from "@/lib/browser-connect";
import DevIdentityPicker from "@/components/DevIdentityPicker";
import { isDevLoginEnabled } from "@/lib/dev-login";

const BRAND_POINTS = [
  {
    icon: Fingerprint,
    title: "No passwords, ever",
    description: "Your VaultysID is your identity — there's nothing to leak, phish, or reset.",
  },
  {
    icon: ShieldCheck,
    title: "Every session is verified",
    description: "The same Challenger handshake, independently re-verifiable, every single time.",
  },
  {
    icon: ScrollText,
    title: "Fully audited access",
    description: "Whatever you're granted lands in a signed, append-only ledger — never a silent flag.",
  },
];

const WALLET_URL = process.env.NEXT_PUBLIC_WALLET_URL || "https://wallet.vaultys.net";
// process.env.NODE_ENV is inlined at build time by Next.js, including in client bundles —
// this is never a runtime env lookup, so it's safe to gate UI on it directly.
const DEV_LOGIN_ENABLED = isDevLoginEnabled();

type Phase = "loading" | "waiting" | "dev-connecting" | "success" | "failure";

/**
 * Passwordless VaultysId login. The QR/wallet flow is the only mechanism in
 * production (docs/REBUILD_ARCHITECTURE.md §1: no username/password
 * fallback); in dev mode only, a second option lets the browser perform the
 * SRP handshake itself with a locally generated software identity — no
 * physical wallet needed. Same Challenger primitive either way, just a
 * different transport (lib/browser-connect.ts, HTTP instead of WebRTC).
 */
interface SsoProviderOption {
  id: string;
  name: string;
  kind: string;
}

export default function LoginPage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [qrUrl, setQrUrl] = useState<string>();
  const [ssoProviders, setSsoProviders] = useState<SsoProviderOption[]>([]);
  const cancelled = useRef(false);

  // Fetched rather than server-rendered: this page is a Client Component driving
  // the whole Challenger handshake, and the provider list is public, tiny, and
  // must not delay the QR code appearing. A failure here just means no SSO
  // buttons — never a broken login page.
  useEffect(() => {
    let ignore = false;
    void (async () => {
      try {
        const res = await fetch("/api/public/sso/providers");
        if (!res.ok) return;
        const { providers } = (await res.json()) as { providers: SsoProviderOption[] };
        if (!ignore) setSsoProviders(providers ?? []);
      } catch {
        // No providers shown; the VaultysID path is unaffected.
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

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

  const startDevLogin = useCallback(async (identity?: BrowserIdData) => {
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
    <main className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary-50/80 via-background to-background" />
      <div className="pointer-events-none absolute left-1/2 top-[-160px] h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-primary-400/10 blur-3xl" />
      <div className="mesh-overlay pointer-events-none absolute inset-0 opacity-30 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]" />

      <Link
        href="/"
        className="relative z-10 flex items-center gap-2.5 p-6 text-sm font-semibold text-foreground"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-600 text-white">
          <ShieldCheck className="h-4 w-4" />
        </span>
        VaultysClaw
      </Link>

      <div className="relative z-10 mx-auto grid max-w-5xl items-center gap-16 px-6 pb-16 pt-4 lg:grid-cols-2 lg:pt-16">
        <div className="hidden lg:block">
          <h1 className="animate-fade-in-up text-4xl font-bold tracking-tight text-foreground">
            Sign in with your{" "}
            <span className="bg-gradient-to-r from-primary-600 via-secondary-600 to-primary-600 bg-clip-text text-transparent">
              VaultysID
            </span>
          </h1>
          <p className="animate-fade-in-up mt-4 max-w-md text-foreground-500" style={{ animationDelay: "100ms" }}>
            No account to create, nothing to remember — just a cryptographic identity only you hold.
          </p>
          <div className="mt-10 space-y-6">
            {BRAND_POINTS.map((point, i) => (
              <div
                key={point.title}
                className="animate-fade-in-up flex items-start gap-3"
                style={{ animationDelay: `${200 + i * 100}ms` }}
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-600">
                  <point.icon className="h-4.5 w-4.5" />
                </span>
                <div>
                  <div className="text-sm font-medium text-foreground">{point.title}</div>
                  <div className="text-sm text-foreground-500">{point.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="animate-fade-in-up mx-auto w-full max-w-sm rounded-2xl border border-neutral-200 bg-background-100 p-8 shadow-xl shadow-primary-950/5">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-600 text-white shadow-lg shadow-primary-600/20">
              <KeyRound className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Sign in with VaultysID</h2>
              <p className="mt-1 text-sm text-foreground-500">
                Open your VaultysID app and scan the QR code below
              </p>
            </div>
          </div>

          {phase === "dev-connecting" ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-foreground-700 font-medium">Connecting via this browser…</p>
              <p className="text-xs text-foreground-400 text-center">
                Authenticating with a software identity stored in this browser.
              </p>
            </div>
          ) : (
            <div className="mt-6 flex justify-center">
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
            <div className="mt-6 flex items-center justify-center gap-2 text-sm text-foreground-500">
              <div className="w-3 h-3 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
              Waiting for scan…
            </div>
          )}
          {phase === "failure" && (
            <div className="mt-6 space-y-3 text-center">
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
            <div className="mt-6 space-y-2 text-center">
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

          {/* SSO is an alternative way to *establish who you are*, never a
              different kind of account — a first sign-in here comes straight back
              to this same VaultysID handshake to bind a DID. Rendered below the
              QR rather than above it because the wallet path remains the primary
              one, and hidden entirely when no provider is configured. */}
          {ssoProviders.length > 0 && phase !== "success" && (
            <div className="mt-8 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-neutral-200/60" />
                <span className="text-xs text-foreground-400">or continue with</span>
                <div className="h-px flex-1 bg-neutral-200/60" />
              </div>
              <div className="space-y-2">
                {ssoProviders.map((provider) => (
                  <button
                    key={provider.id}
                    onClick={() => void signIn(provider.id, { callbackUrl: "/" })}
                    className="w-full px-4 py-2 border border-neutral-200 rounded-lg text-sm font-medium text-foreground hover:bg-background-200/60 transition-colors"
                  >
                    {provider.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
