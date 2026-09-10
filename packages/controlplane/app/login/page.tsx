"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { signIn } from "next-auth/react";
import { ShieldCheck, Fingerprint, ScrollText, KeyRound } from "lucide-react";
import {
  connectWithBrowserIdentity,
  completeCertificateRound,
  hasBrowserIdentity,
  type BrowserIdData,
} from "@/lib/browser-connect";
import BrowserIdentityPicker from "@/components/BrowserIdentityPicker";
import { isBrowserBootstrapEnabled } from "@/lib/browser-bootstrap";
import { useAdvancedIdentity } from "@/lib/advanced-identity";

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
const BROWSER_BOOTSTRAP_ENABLED = isBrowserBootstrapEnabled();

type Phase = "loading" | "waiting" | "browser-connecting" | "success" | "failure";

/**
 * What to tell someone whose SSO sign-in failed.
 *
 * Deliberately vague about the cause, and it never echoes the IdP's own error:
 * this page is public, and "the client secret is wrong" is a fact about the
 * deployment's configuration, not something to hand an anonymous visitor. The
 * detail belongs in the server log and on the connection's detail page, which is
 * admin-gated. What the visitor needs is that it was not their fault, and who
 * can fix it.
 */
const SIGN_IN_ERRORS: Record<string, string> = {
  OAuthCallback:
    "That provider signed you in, but this deployment could not complete the exchange with it. Its connection settings need attention from an administrator — nothing is wrong on your side.",
  OAuthSignin:
    "Could not start sign-in with that provider. An administrator should check its connection settings.",
  AccessDenied: "That provider declined the sign-in.",
  Default:
    "Sign-in with that provider failed. An administrator should check its connection settings.",
};

/**
 * Passwordless VaultysId login, over either transport: a wallet app scanning the
 * QR code, or a VaultysID this browser already holds
 * (`lib/browser-connect.ts` — same Challenger primitive, HTTP instead of
 * WebRTC).
 *
 * The browser-key option appears **only once this browser actually holds a key**,
 * because that is what makes it a login rather than a registration: the server
 * hands out a connection certificate, and `loginHuman` rejects any DID that is
 * not already a registered Actor. *Minting* a key here — which is how the very
 * first human bootstraps themselves into `admin_console_access` — stays gated on
 * `isBrowserBootstrapEnabled()`, since a key an anonymous visitor generated in
 * their own browser is not evidence of anything. Humans who registered through
 * SSO get their browser key from the binding step at `/invite/[token]?sso=1`, not
 * from here.
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
  // localStorage read in an effect, not during render — see lib/advanced-identity.ts.
  const [hasKey, setHasKey] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [advanced, setAdvanced] = useAdvancedIdentity();
  const cancelled = useRef(false);

  useEffect(() => setHasKey(hasBrowserIdentity()), []);

  // Read from `window.location` in an effect rather than with `useSearchParams`,
  // which would force this page out of static prerendering (or need a Suspense
  // boundary) for a param that is absent on virtually every visit.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    if (code) setSignInError(SIGN_IN_ERRORS[code] ?? SIGN_IN_ERRORS.Default);
  }, []);

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
      if (cancelled.current) return;
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

  const startBrowserLogin = useCallback(async (identity?: BrowserIdData) => {
    setPhase("browser-connecting");
    cancelled.current = false;

    const res = await fetch("/api/public/user/connect");
    // 404 means this deployment has no human yet *and* browser bootstrap is off —
    // the route's own gate. Nothing to poll, so say so rather than spinning for
    // three minutes.
    if (!res.ok) {
      setPhase("failure");
      return;
    }
    const { token, key } = await res.json();

    // Errors here surface through the poll below (the server marks the cert
    // failed), so a rejection is intentionally swallowed rather than shown
    // directly — same behavior as the QR flow's failure path.
    void connectWithBrowserIdentity(key, identity).catch(() => {});
    await pollAndSignIn(token, key);
  }, [pollAndSignIn]);

  useEffect(() => {
    start();
    return () => {
      cancelled.current = true;
    };
  }, [start]);

  // A key already in this browser is a login; offering to make one is a
  // registration, and only the bootstrap gate opens that.
  const showBrowserOption = hasKey || BROWSER_BOOTSTRAP_ENABLED;

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

          {signInError && (
            <div className="mt-6 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700">
              {signInError}
            </div>
          )}

          {phase === "browser-connecting" ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-foreground-700 font-medium">Connecting via this browser…</p>
              <p className="text-xs text-foreground-400 text-center">
                Proving a VaultysID stored in this browser.
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

          {showBrowserOption && (phase === "waiting" || phase === "loading") && (
            <div className="mt-6 space-y-2 text-center">
              <button
                onClick={() => startBrowserLogin()}
                className="text-xs text-foreground-400 hover:text-foreground-600 transition-colors underline underline-offset-2"
              >
                {hasKey
                  ? "Sign in with a VaultysID in this browser"
                  : "Create a VaultysID in this browser"}
              </button>
              {advanced ? (
                <div>
                  <BrowserIdentityPicker onSelect={(identity) => startBrowserLogin(identity)} />
                </div>
              ) : (
                /*
                 * The switch that reveals multi-key management — including backup/restore — lives
                 * on `/identity`, which requires being signed in. That is a closed loop for the one
                 * case that needs it most: a fresh browser holding no key, restoring a backup in
                 * order to sign in. Whoever is looking at this page is exactly that person, so the
                 * switch is offered here too.
                 *
                 * It grants nothing. The flag is per-browser `localStorage` and only decides which
                 * controls are drawn; every key it manages is one this browser already holds, and
                 * signing in still needs a real Challenger exchange against a real Actor.
                 */
                <div>
                  <button
                    onClick={() => setAdvanced(true)}
                    className="text-[11px] text-foreground-400/80 hover:text-foreground-600 transition-colors underline underline-offset-2"
                  >
                    Use a saved or backed-up VaultysID
                  </button>
                </div>
              )}
            </div>
          )}

          {/* SSO is an alternative way to *establish who you are*, never a
              different kind of account — a first sign-in here comes straight back
              to the same VaultysID handshake (at /invite/[token]?sso=1) to bind a
              DID. Rendered below the QR rather than above it because the wallet
              path remains the primary one, and hidden entirely when no provider is
              configured. */}
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
