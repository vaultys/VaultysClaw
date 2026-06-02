"use client";

import { useState, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Mail, QrCode, Check, Loader2, AlertCircle, ChevronLeft } from "lucide-react";

type Tab = "method" | "email" | "qr";
type Phase = "idle" | "loading" | "qr" | "success" | "failure";

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
  const [tab, setTab] = useState<Tab>("method");
  const [phase, setPhase] = useState<Phase>("idle");
  const [qrUrl, setQrUrl] = useState<string>("");
  const [emailForm, setEmailForm] = useState({ email: "", name: "", role: "member" });
  const [emailSending, setEmailSending] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ type: "ok" | "fail"; text: string } | null>(null);

  // Email invitation flow
  const sendEmailInvite = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailForm.email || !emailForm.name) return;
    setEmailSending(true);
    setEmailMsg(null);
    try {
      const res = await fetch("/api/users/invite/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(emailForm),
      });
      if (res.ok) {
        setEmailMsg({ type: "ok", text: `Invitation sent to ${emailForm.email}` });
        setEmailForm({ email: "", name: "", role: "member" });
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1500);
      } else {
        setEmailMsg({ type: "fail", text: "Failed to send invitation" });
      }
    } catch {
      setEmailMsg({ type: "fail", text: "Network error" });
    } finally {
      setEmailSending(false);
    }
  }, [emailForm, onSuccess, onClose]);

  // QR code flow
  const generateQR = useCallback(async () => {
    setPhase("loading");
    try {
      const [inviteRes, settingsRes] = await Promise.all([
        fetch("/api/users/invite"),
        fetch("/api/server/settings"),
      ]);
      if (!inviteRes.ok) throw new Error("Failed to create invite");

      const data = (await inviteRes.json()) as InviteResult;
      const { walletUrl } = (await settingsRes.json()) as { walletUrl: string };
      const base = walletUrl ?? "https://wallet.vaultys.net";
      const didParam = data.serverDid
        ? `&did=${encodeURIComponent(data.serverDid)}`
        : "";
      const url = `${base}/#${data.connectionString}&protocol=p2p&service=auth${didParam}`;
      setQrUrl(url);
      setPhase("qr");

      // Poll until done
      for (let i = 0; i < 180; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const r = await fetch(`/api/user/listen/${data.token}`);
        const { status } = (await r.json()) as { status: number };
        if (status === 2) {
          setPhase("success");
          onSuccess();
          return;
        }
        if (status === -2) {
          setPhase("failure");
          return;
        }
      }
      setPhase("failure");
    } catch {
      setPhase("failure");
    }
  }, [onSuccess]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-background-100 border border-neutral-300 rounded-2xl p-8 w-full max-w-sm shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          {tab !== "method" && (
            <button
              onClick={() => {
                setTab("method");
                setPhase("idle");
                setEmailMsg(null);
              }}
              className="flex items-center gap-1 text-foreground-500 hover:text-foreground transition-colors"
            >
              <ChevronLeft size={18} />
              <span className="text-sm">Back</span>
            </button>
          )}
          {tab === "method" && <h2 className="text-foreground font-semibold text-lg flex-1">Invite User</h2>}
          <button onClick={onClose} className="text-foreground-500 hover:text-foreground transition-colors">✕</button>
        </div>

        {/* Method selection */}
        {tab === "method" && phase === "idle" && (
          <div className="space-y-3">
            <p className="text-foreground-500 text-sm mb-4">Choose how to invite the user</p>
            <button
              onClick={() => setTab("email")}
              className="w-full flex items-center gap-3 p-4 border border-neutral-200 rounded-xl hover:bg-background-200 transition-colors text-left"
            >
              <Mail className="w-5 h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Send Email Invite</p>
                <p className="text-xs text-foreground-500">User gets a link to scan QR</p>
              </div>
            </button>
            <button
              onClick={() => setTab("qr")}
              className="w-full flex items-center gap-3 p-4 border border-neutral-200 rounded-xl hover:bg-background-200 transition-colors text-left"
            >
              <QrCode className="w-5 h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Show QR Code</p>
                <p className="text-xs text-foreground-500">User scans immediately</p>
              </div>
            </button>
          </div>
        )}

        {/* Email tab */}
        {tab === "email" && (
          <form onSubmit={sendEmailInvite} className="space-y-4">
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-foreground-500 mb-1.5">Email</label>
                <input
                  type="email"
                  value={emailForm.email}
                  onChange={(e) => setEmailForm({ ...emailForm, email: e.target.value })}
                  placeholder="user@example.com"
                  className="w-full bg-background-200 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-foreground-500 mb-1.5">Name</label>
                <input
                  type="text"
                  value={emailForm.name}
                  onChange={(e) => setEmailForm({ ...emailForm, name: e.target.value })}
                  placeholder="John Doe"
                  className="w-full bg-background-200 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-foreground-500 mb-1.5">Role</label>
                <select
                  value={emailForm.role}
                  onChange={(e) => setEmailForm({ ...emailForm, role: e.target.value })}
                  className="w-full bg-background-200 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                >
                  <option value="member">Member</option>
                  <option value="operator">Operator</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>

            {emailMsg && (
              <p
                className={`text-xs px-3 py-2 rounded-xl border ${
                  emailMsg.type === "ok"
                    ? "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700/40 text-green-700 dark:text-green-400"
                    : "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700/40 text-red-600 dark:text-red-400"
                }`}
              >
                {emailMsg.text}
              </p>
            )}

            <button
              type="submit"
              disabled={emailSending || !emailForm.email || !emailForm.name}
              className="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl disabled:opacity-40 transition-colors"
            >
              {emailSending ? "Sending…" : "Send Invitation"}
            </button>
          </form>
        )}

        {/* QR tab */}
        {tab === "qr" && (
          <>
            {phase === "idle" && (
              <>
                <p className="text-foreground-500 text-sm mb-6">
                  Generate a one-time QR code. The new user scans it with their Vaultys wallet to register.
                </p>
                <button
                  onClick={generateQR}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 rounded-xl transition-colors"
                >
                  Generate Invite QR
                </button>
              </>
            )}

            {phase === "loading" && (
              <div className="flex flex-col items-center gap-4 py-4">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                <p className="text-foreground-500 text-sm">Creating secure channel…</p>
              </div>
            )}

            {phase === "qr" && (
              <div className="flex flex-col items-center gap-4">
                <p className="text-foreground-500 text-sm text-center">
                  Ask the new user to scan this QR with their Vaultys wallet.
                </p>
                <div className="bg-white p-3 rounded-xl">
                  <QRCodeSVG value={qrUrl} size={200} />
                </div>
                <p className="text-foreground-400 text-xs text-center">Waiting for wallet connection…</p>
                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {phase === "success" && (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                  <Check className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <p className="text-foreground font-medium">User registered!</p>
                <button onClick={onClose} className="text-indigo-700 dark:text-indigo-400 hover:text-indigo-300 text-sm transition-colors">
                  Close
                </button>
              </div>
            )}

            {phase === "failure" && (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                <p className="text-red-600 dark:text-red-400 font-medium">Registration failed or timed out.</p>
                <button
                  onClick={() => setPhase("idle")}
                  className="text-indigo-700 dark:text-indigo-400 hover:text-indigo-300 text-sm transition-colors"
                >
                  Try again
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
