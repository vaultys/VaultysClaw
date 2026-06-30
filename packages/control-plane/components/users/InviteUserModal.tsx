"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Loader2, AlertCircle, Mail, QrCode } from "lucide-react";
import { usersClient, userAuthClient, unwrap } from "@/lib/api/ts-rest/client";

type Phase = "form" | "sending" | "sent" | "qr-loading" | "qr" | "qr-success" | "qr-failure";

interface InviteUserModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function InviteUserModal({
  onClose,
  onSuccess,
}: InviteUserModalProps) {
  const [phase, setPhase] = useState<Phase>("form");
  const [form, setForm] = useState({ email: "", name: "", role: "Member" });
  const [error, setError] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState("");

  // Cancel the QR poll when the modal unmounts so /api/user/listen stops being
  // called once it is closed.
  const pollRef = useRef<{ cancelled: boolean } | null>(null);
  useEffect(
    () => () => {
      if (pollRef.current) pollRef.current.cancelled = true;
    },
    []
  );

  const canSubmit = form.email.trim() !== "" && form.name.trim() !== "";

  const sendEmail = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!canSubmit) return;
      setPhase("sending");
      setError(null);
      try {
        const res = await fetch("/api/users/invite/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (res.ok) {
          setPhase("sent");
          onSuccess();
        } else {
          const d = (await res.json()) as { error?: string };
          setError(d.error ?? "Failed to send invitation");
          setPhase("form");
        }
      } catch {
        setError("Network error");
        setPhase("form");
      }
    },
    [form, canSubmit, onSuccess]
  );

  const showQR = useCallback(async () => {
    if (!canSubmit) return;
    setPhase("qr-loading");
    setError(null);
    try {
      // Create invitation and unclaimed user without sending email
      const invRes = await fetch("/api/users/invite/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, skipEmail: true }),
      });
      if (!invRes.ok) {
        const d = (await invRes.json()) as { error?: string };
        setError(d.error ?? "Failed to create invitation");
        setPhase("form");
        return;
      }
      const { token } = (await invRes.json()) as { token: string };

      // Generate QR from the invitation token
      let url: string;
      let inviteToken: string;
      try {
        const data = unwrap(
          await usersClient.inviteFromEmail({ body: { token } })
        );
        url = data.qrUrl;
        inviteToken = data.inviteToken;
      } catch {
        setError("Failed to generate QR code");
        setPhase("form");
        return;
      }
      setQrUrl(url);
      setPhase("qr");
      onSuccess();

      // Start a fresh poll, cancelling any previous one.
      if (pollRef.current) pollRef.current.cancelled = true;
      const poll = { cancelled: false };
      pollRef.current = poll;

      // Poll for wallet connection
      for (let i = 0; i < 180; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        if (poll.cancelled) return;
        const { status } = unwrap(
          await userAuthClient.listen({ params: { token: inviteToken } })
        );
        if (poll.cancelled) return;
        if (status === 2) { setPhase("qr-success"); return; }
        if (status === -2) { setPhase("qr-failure"); return; }
      }
      setPhase("qr-failure");
    } catch {
      setError("Network error");
      setPhase("form");
    }
  }, [form, canSubmit, onSuccess]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-background-100 border border-neutral-300 rounded-2xl p-8 w-full max-w-sm shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-foreground font-semibold text-lg">Invite User</h2>
          <button
            onClick={onClose}
            className="text-foreground-500 hover:text-foreground transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        {(phase === "form" || phase === "sending") && (
          <form onSubmit={sendEmail} className="space-y-4">
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-foreground-500 mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="user@example.com"
                  className="w-full bg-background-200 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs text-foreground-500 mb-1.5">
                  Name
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Jane Smith"
                  className="w-full bg-background-200 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-foreground-500 mb-1.5">
                  Role
                </label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full bg-background-200 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                >
                  <option value="Member">Member</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>
            </div>

            {error && (
              <p className="text-xs px-3 py-2 rounded-xl border bg-danger-50 border-danger-300 text-danger-600">
                {error}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={phase === "sending" || !canSubmit}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-xl disabled:opacity-40 transition-colors"
              >
                {phase === "sending" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Mail className="w-4 h-4" />
                )}
                Send Email
              </button>
              <button
                type="button"
                disabled={phase === "sending" || !canSubmit}
                onClick={showQR}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-background-200 hover:bg-background-300 border border-neutral-200 text-foreground text-sm font-medium rounded-xl disabled:opacity-40 transition-colors"
              >
                <QrCode className="w-4 h-4" />
                Show QR
              </button>
            </div>
          </form>
        )}

        {/* Email sent */}
        {phase === "sent" && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="w-12 h-12 rounded-full bg-success-100 flex items-center justify-center">
              <Check className="w-6 h-6 text-success-600" />
            </div>
            <p className="text-foreground font-medium">Invitation sent!</p>
            <p className="text-foreground-500 text-sm">{form.email}</p>
            <button
              onClick={onClose}
              className="text-primary-700 hover:text-primary-300 text-sm transition-colors mt-1"
            >
              Close
            </button>
          </div>
        )}

        {/* QR loading */}
        {phase === "qr-loading" && (
          <div className="flex flex-col items-center gap-4 py-4">
            <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
            <p className="text-foreground-500 text-sm">Creating secure channel…</p>
          </div>
        )}

        {/* QR display */}
        {phase === "qr" && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-foreground-500 text-sm text-center">
              Ask {form.name || "the user"} to scan this QR with their Vaultys wallet.
            </p>
            <div className="bg-white p-3 rounded-xl">
              <QRCodeSVG value={qrUrl} size={200} />
            </div>
            <p className="text-foreground-400 text-xs text-center">
              Waiting for wallet connection…
            </p>
            <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* QR success */}
        {phase === "qr-success" && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="w-12 h-12 rounded-full bg-success-100 flex items-center justify-center">
              <Check className="w-6 h-6 text-success-600" />
            </div>
            <p className="text-foreground font-medium">User registered!</p>
            <button
              onClick={onClose}
              className="text-primary-700 hover:text-primary-300 text-sm transition-colors"
            >
              Close
            </button>
          </div>
        )}

        {/* QR failure */}
        {phase === "qr-failure" && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <AlertCircle className="w-6 h-6 text-danger-600" />
            <p className="text-danger-600 font-medium">
              Registration failed or timed out.
            </p>
            <button
              onClick={() => { setPhase("form"); setError(null); }}
              className="text-primary-700 hover:text-primary-300 text-sm transition-colors"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
