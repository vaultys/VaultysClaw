"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Check, Loader2, AlertCircle, ChevronRight, Shield } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

type InvitePhase = "loading" | "info" | "qr-loading" | "qr" | "success" | "error" | "expired";

interface InviteDetails {
  email: string;
  name: string;
  role: string;
}

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [phase, setPhase] = useState<InvitePhase>("loading");
  const [details, setDetails] = useState<InviteDetails | null>(null);
  const [error, setError] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [waitingCount, setWaitingCount] = useState(0);

  // Fetch invitation details
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/invitations/${token}`);
        if (res.status === 404) {
          setPhase("expired");
          return;
        }
        if (!res.ok) throw new Error("Failed to load invitation");
        const data = await res.json() as InviteDetails;
        setDetails(data);
        setPhase("info");
      } catch (err) {
        setError((err as Error).message);
        setPhase("error");
      }
    };
    load();
  }, [token]);

  const generateQR = useCallback(async () => {
    if (!token) return;
    setPhase("qr-loading");
    try {
      const res = await fetch("/api/users/invite/from-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) throw new Error("Failed to generate QR");
      const data = await res.json() as { qrUrl: string; connectionString: string; inviteToken: string; serverDid?: string };
      setQrUrl(data.qrUrl);
      setPhase("qr");

      // Poll for connection using the returned invite token
      for (let i = 0; i < 180; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const r = await fetch(`/api/user/listen/${data.inviteToken}`);
        const { status: s } = await r.json() as { status: number };
        if (s === 2) {
          // Delete the invitation after successful connection
          await fetch(`/api/invitations/${token}/delete`, { method: "POST" }).catch(() => {});
          setPhase("success");
          return;
        }
        if (s === -2) {
          setPhase("error");
          setError("Connection failed");
          return;
        }
        setWaitingCount((n) => n + 1);
      }
      setPhase("error");
      setError("Connection timed out");
    } catch (err) {
      setPhase("error");
      setError((err as Error).message);
    }
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50/70 via-white to-purple-50/40 dark:from-gray-950 dark:via-indigo-950 dark:to-gray-950 p-4">
      {/* Ambient blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[450px] bg-indigo-200/40 dark:bg-indigo-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-purple-200/30 dark:bg-purple-600/8 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Loading */}
        {phase === "loading" && (
          <div className="text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-400/30 flex items-center justify-center mx-auto">
              <Loader2 className="w-6 h-6 text-indigo-600 dark:text-indigo-400 animate-spin" />
            </div>
            <p className="text-vc-muted">Loading invitation…</p>
          </div>
        )}

        {/* Expired */}
        {phase === "expired" && (
          <div className="bg-vc-surface border border-vc-border rounded-2xl p-6 shadow-sm text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-500/20 border border-red-200 dark:border-red-400/30 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-vc-text">Invitation expired</h2>
              <p className="text-vc-muted text-sm mt-1">This invitation link is no longer valid. Please request a new one from your admin.</p>
            </div>
          </div>
        )}

        {/* Error */}
        {phase === "error" && (
          <div className="bg-vc-surface border border-vc-border rounded-2xl p-6 shadow-sm text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-500/20 border border-red-200 dark:border-red-400/30 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-vc-text">Error</h2>
              <p className="text-vc-muted text-sm mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Invitation details & QR generation */}
        {phase === "info" && details && (
          <div className="bg-vc-surface border border-vc-border rounded-2xl p-8 shadow-sm space-y-6">
            {/* Header */}
            <div className="text-center">
              <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-sm leading-none shadow shadow-indigo-600/30 mx-auto mb-4">
                🦞
              </div>
              <h1 className="text-2xl font-bold text-vc-text">Welcome to VaultysClaw!</h1>
              <p className="text-vc-muted text-sm mt-2">Secure AI control plane for teams</p>
            </div>

            {/* Invitation details */}
            <div className="space-y-3 bg-vc-raised rounded-xl p-4">
              <div className="flex justify-between items-start text-sm">
                <span className="text-vc-muted">Name</span>
                <span className="font-medium text-vc-text text-right">{details.name}</span>
              </div>
              <div className="flex justify-between items-start text-sm">
                <span className="text-vc-muted">Email</span>
                <span className="font-medium text-vc-text text-right">{details.email}</span>
              </div>
              <div className="flex justify-between items-start text-sm">
                <span className="text-vc-muted">Role</span>
                <span className="font-medium text-vc-text text-right capitalize">{details.role}</span>
              </div>
            </div>

            {/* Info text */}
            <p className="text-vc-muted text-sm text-center leading-relaxed">
              To complete your setup, scan the QR code with your Vaultys wallet app.
            </p>

            {/* CTA Button */}
            <button
              onClick={generateQR}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition-colors"
            >
              <Shield className="w-4 h-4" /> Generate QR Code
            </button>
          </div>
        )}

        {/* QR Loading */}
        {phase === "qr-loading" && (
          <div className="bg-vc-surface border border-vc-border rounded-2xl p-8 shadow-sm text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-400/30 flex items-center justify-center mx-auto">
              <Loader2 className="w-6 h-6 text-indigo-600 dark:text-indigo-400 animate-spin" />
            </div>
            <p className="text-vc-muted">Generating QR code…</p>
          </div>
        )}

        {/* QR Code */}
        {phase === "qr" && details && (
          <div className="bg-vc-surface border border-vc-border rounded-2xl p-8 shadow-sm text-center space-y-4">
            <h2 className="text-lg font-bold text-vc-text">Scan QR Code</h2>
            <p className="text-vc-muted text-sm">Open your Vaultys Wallet and scan this code</p>
            <div className="bg-white p-4 rounded-2xl shadow-lg flex justify-center">
              <QRCodeSVG value={qrUrl} size={200} />
            </div>
            <div className="flex items-center justify-center gap-2 text-vc-subtle text-xs animate-pulse">
              <div className="w-3 h-3 rounded-full bg-indigo-500" />
              Waiting for wallet connection…
            </div>
          </div>
        )}

        {/* Success */}
        {phase === "success" && (
          <div className="bg-vc-surface border border-vc-border rounded-2xl p-8 shadow-sm text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-500/15 border border-green-300 dark:border-green-500/30 flex items-center justify-center mx-auto">
              <Check className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-vc-text">Welcome aboard!</h2>
              <p className="text-vc-muted text-sm mt-2">Your account is set up. You can now log in.</p>
            </div>
            <button
              onClick={() => router.push("/login")}
              className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition-colors"
            >
              Go to Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
