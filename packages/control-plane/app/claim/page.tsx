"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Check,
  Loader2,
  AlertCircle,
  Shield,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

type ClaimPhase = "loading" | "ready" | "qr-loading" | "qr" | "success" | "error";

export default function ClaimPage() {
  const router = useRouter();
  const { data: session, status, update } = useSession();

  const [phase, setPhase] = useState<ClaimPhase>("loading");
  const [error, setError] = useState("");
  const [qrUrl, setQrUrl] = useState("");

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    // Already has a DID — no need to claim
    if (session?.user?.did) {
      router.replace("/");
      return;
    }
    setPhase("ready");
  }, [status, session, router]);

  const generateQR = useCallback(async () => {
    setPhase("qr-loading");
    try {
      const res = await fetch("/api/users/claim", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to generate QR");
      }
      const data = (await res.json()) as {
        qrUrl: string;
        inviteToken: string;
      };
      setQrUrl(data.qrUrl);
      setPhase("qr");

      // Poll until the wallet completes the VaultysId registration
      for (let i = 0; i < 180; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const r = await fetch(`/api/user/listen/${data.inviteToken}`);
        const { status: s } = (await r.json()) as { status: number };
        if (s === 2) {
          // Refresh the JWT so it picks up the newly claimed DID
          await update();
          setPhase("success");
          return;
        }
        if (s === -2) {
          setPhase("error");
          setError("Connection failed");
          return;
        }
      }
      setPhase("error");
      setError("Connection timed out");
    } catch (err) {
      setPhase("error");
      setError((err as Error).message);
    }
  }, [update]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50/70 via-background to-secondary-50/40 p-4">
      {/* Ambient blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[450px] bg-primary-200/40 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-secondary-200/30 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Loading */}
        {phase === "loading" && (
          <div className="text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-primary-100 border border-primary-200 flex items-center justify-center mx-auto">
              <Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
            </div>
            <p className="text-foreground-500">Loading…</p>
          </div>
        )}

        {/* Error */}
        {phase === "error" && (
          <div className="bg-background-100 border border-neutral-200 rounded-2xl p-6 shadow-sm text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-danger-100 border border-danger-200 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6 text-danger-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Error</h2>
              <p className="text-foreground-500 text-sm mt-1">{error}</p>
            </div>
            <button
              onClick={() => { setPhase("ready"); setError(""); }}
              className="w-full px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white font-medium rounded-xl transition-colors"
            >
              Try again
            </button>
          </div>
        )}

        {/* Ready — intro card */}
        {phase === "ready" && (
          <div className="bg-background-100 border border-neutral-200 rounded-2xl p-8 shadow-sm space-y-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-primary-600 rounded-xl flex items-center justify-center text-sm leading-none shadow shadow-primary-600/30 mx-auto mb-4">
                🦞
              </div>
              <h1 className="text-2xl font-bold text-foreground">
                Link your VaultysId
              </h1>
              <p className="text-foreground-500 text-sm mt-2">
                Your account was provisioned via SSO. Scan the QR code with
                your Vaultys wallet to complete setup and enable cryptographic
                identity.
              </p>
            </div>

            {session?.user?.email || session?.user?.name ? (
              <div className="space-y-2 bg-background-200 rounded-xl p-4">
                {session.user.name && (
                  <div className="flex justify-between items-start text-sm">
                    <span className="text-foreground-500">Name</span>
                    <span className="font-medium text-foreground text-right">
                      {session.user.name}
                    </span>
                  </div>
                )}
                {session.user.email && (
                  <div className="flex justify-between items-start text-sm">
                    <span className="text-foreground-500">Email</span>
                    <span className="font-medium text-foreground text-right">
                      {session.user.email}
                    </span>
                  </div>
                )}
              </div>
            ) : null}

            <button
              onClick={generateQR}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary-600 hover:bg-primary-500 text-white font-medium rounded-xl transition-colors"
            >
              <Shield className="w-4 h-4" /> Generate QR Code
            </button>
          </div>
        )}

        {/* QR Loading */}
        {phase === "qr-loading" && (
          <div className="bg-background-100 border border-neutral-200 rounded-2xl p-8 shadow-sm text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-primary-100 border border-primary-200 flex items-center justify-center mx-auto">
              <Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
            </div>
            <p className="text-foreground-500">Generating QR code…</p>
          </div>
        )}

        {/* QR Code */}
        {phase === "qr" && (
          <div className="bg-background-100 border border-neutral-200 rounded-2xl p-8 shadow-sm text-center space-y-4">
            <h2 className="text-lg font-bold text-foreground">Scan QR Code</h2>
            <p className="text-foreground-500 text-sm">
              Open your Vaultys Wallet and scan this code
            </p>
            <div className="bg-white p-4 rounded-2xl shadow-lg flex justify-center">
              <QRCodeSVG value={qrUrl} size={200} />
            </div>
            <div className="flex items-center justify-center gap-2 text-foreground-400 text-xs animate-pulse">
              <div className="w-3 h-3 rounded-full bg-primary-500" />
              Waiting for wallet connection…
            </div>
          </div>
        )}

        {/* Success */}
        {phase === "success" && (
          <div className="bg-background-100 border border-neutral-200 rounded-2xl p-8 shadow-sm text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-success-100 border border-success-300 flex items-center justify-center mx-auto">
              <Check className="w-6 h-6 text-success-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">
                VaultysId linked!
              </h2>
              <p className="text-foreground-500 text-sm mt-2">
                Your identity is set up. You can now access the platform.
              </p>
            </div>
            <button
              onClick={() => router.push("/")}
              className="w-full px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white font-medium rounded-xl transition-colors"
            >
              Go to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
