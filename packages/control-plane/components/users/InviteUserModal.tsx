"use client";

import { useState, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";

interface InviteResult {
  connectionString: string;
  token: string;
  key: string;
  serverDid: string | null;
}

interface InviteUserModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function InviteUserModal({ onClose, onSuccess }: InviteUserModalProps) {
  const [phase, setPhase] = useState<"idle" | "loading" | "qr" | "success" | "failure">("idle");
  const [qrUrl, setQrUrl] = useState<string>("");

  const start = useCallback(async () => {
    setPhase("loading");
    try {
      const res = await fetch("/api/users/invite");
      if (!res.ok) throw new Error("Failed to create invite");

      const data = (await res.json()) as InviteResult;
      const didParam = data.serverDid
        ? `&did=${encodeURIComponent(data.serverDid)}`
        : "";
      const url = `https://wallet.vaultys.net/#${data.connectionString}&protocol=p2p&service=auth${didParam}`;
      setQrUrl(url);
      setPhase("qr");

      // Poll until done
      const poll = async () => {
        for (let i = 0; i < 180; i++) {
          await new Promise((r) => setTimeout(r, 1500));
          const r = await fetch(`/api/user/listen/${data.token}`);
          const { status } = (await r.json()) as { status: number };
          if (status === 2) { setPhase("success"); onSuccess(); return; }
          if (status === -2) { setPhase("failure"); return; }
        }
        setPhase("failure");
      };
      poll();
    } catch {
      setPhase("failure");
    }
  }, [onSuccess]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-vc-surface border border-vc-ring rounded-2xl p-8 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-vc-text font-semibold text-lg">Invite User</h2>
          <button onClick={onClose} className="text-vc-muted hover:text-vc-text transition-colors">✕</button>
        </div>

        {phase === "idle" && (
          <>
            <p className="text-vc-muted text-sm mb-6">
              Generate a one-time QR code. The new user scans it with their Vaultys wallet to register.
            </p>
            <button
              onClick={start}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 rounded-xl transition-colors"
            >
              Generate Invite QR
            </button>
          </>
        )}

        {phase === "loading" && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-vc-muted text-sm">Creating secure channel…</p>
          </div>
        )}

        {phase === "qr" && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-vc-muted text-sm text-center">
              Ask the new user to scan this QR with their Vaultys wallet.
            </p>
            <div className="bg-white p-3 rounded-xl">
              <QRCodeSVG value={qrUrl} size={200} />
            </div>
            <p className="text-vc-subtle text-xs text-center">Waiting for wallet connection…</p>
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {phase === "success" && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-vc-text font-medium">User registered!</p>
            <button onClick={onClose} className="text-indigo-700 dark:text-indigo-400 hover:text-indigo-300 text-sm transition-colors">Close</button>
          </div>
        )}

        {phase === "failure" && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <p className="text-red-600 dark:text-red-400 font-medium">Registration failed or timed out.</p>
            <button
              onClick={() => setPhase("idle")}
              className="text-indigo-700 dark:text-indigo-400 hover:text-indigo-300 text-sm transition-colors"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
