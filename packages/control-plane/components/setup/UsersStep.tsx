"use client";

import { useCallback, useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Field, StepFooter } from "./ui";

type InviteTab = "qr" | "email" | "entra";
type QrPhase = "idle" | "loading" | "qr" | "success" | "failure";

export function UsersStep({ onNext }: { onNext: () => void }) {
  const [tab, setTab] = useState<InviteTab>("qr");
  const [phase, setPhase] = useState<QrPhase>("idle");
  const [qrUrl, setQrUrl] = useState("");
  const [addedCount, setAddedCount] = useState(0);
  const [emailForm, setEmailForm] = useState({
    email: "",
    name: "",
    role: "Member",
  });
  const [emailSending, setEmailSending] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{
    type: "ok" | "fail";
    text: string;
  } | null>(null);

  const startInvite = useCallback(async () => {
    setPhase("loading");
    try {
      const [inviteRes, settingsRes] = await Promise.all([
        fetch("/api/users/invite"),
        fetch("/api/server/settings"),
      ]);
      if (!inviteRes.ok) throw new Error("invite failed");
      const data = (await inviteRes.json()) as {
        connectionString: string;
        token: string;
        serverDid: string | null;
      };
      const { walletUrl } = (await settingsRes.json()) as { walletUrl: string };
      const base = walletUrl ?? "https://wallet.vaultys.net";
      const didParam = data.serverDid
        ? `&did=${encodeURIComponent(data.serverDid)}`
        : "";
      setQrUrl(
        `${base}/#${data.connectionString}&protocol=p2p&service=auth${didParam}`
      );
      setPhase("qr");
      for (let i = 0; i < 180; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const r = await fetch(`/api/user/listen/${data.token}`);
        const { status: s } = (await r.json()) as { status: number };
        if (s === 2) {
          setPhase("success");
          setAddedCount((n) => n + 1);
          return;
        }
        if (s === -2) {
          setPhase("failure");
          return;
        }
      }
      setPhase("failure");
    } catch {
      setPhase("failure");
    }
  }, []);

  const isIdle = phase === "idle" || phase === "failure";

  const sendEmailInvite = useCallback(
    async (e: React.FormEvent) => {
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
          setEmailMsg({
            type: "ok",
            text: `Invitation sent to ${emailForm.email}`,
          });
          setEmailForm({ email: "", name: "", role: "Member" });
          setAddedCount((n) => n + 1);
        } else {
          setEmailMsg({ type: "fail", text: "Failed to send invitation" });
        }
      } catch {
        setEmailMsg({ type: "fail", text: "Network error" });
      } finally {
        setEmailSending(false);
      }
    },
    [emailForm]
  );

  return (
    <div className="space-y-5">
      <p className="text-foreground-500 text-sm leading-relaxed">
        Invite teammates so they can manage agents and workflows alongside you.
      </p>

      {/* Tab selector */}
      <div className="flex gap-1 p-1 bg-background-200 border border-neutral-200 rounded-xl">
        {(["qr", "email", "entra"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setPhase("idle");
            }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              tab === t
                ? "bg-background-100 border border-neutral-200 text-foreground shadow-sm"
                : "text-foreground-500 hover:text-foreground"
            }`}
          >
            {t === "qr"
              ? "QR Code"
              : t === "email"
                ? "Email Invite"
                : "Microsoft Entra ID"}
          </button>
        ))}
      </div>

      {/* QR tab */}
      {tab === "qr" && (
        <>
          {phase === "idle" && (
            <div className="text-center py-4 space-y-4">
              {addedCount > 0 && (
                <p className="text-sm text-success-600">
                  ✓ {addedCount} user{addedCount > 1 ? "s" : ""} invited
                </p>
              )}
              <p className="text-foreground-500 text-sm">
                Generate a one-time QR code. The user scans it with their
                Vaultys wallet.
              </p>
              <button
                onClick={startInvite}
                className="px-5 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-xl transition-colors"
              >
                {addedCount > 0 ? "Invite another" : "Generate Invite QR"}
              </button>
            </div>
          )}

          {phase === "loading" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="w-7 h-7 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-foreground-500 text-sm">
                Creating secure channel…
              </p>
            </div>
          )}

          {phase === "qr" && (
            <div className="flex flex-col items-center gap-4 py-2">
              <div className="bg-white p-3 rounded-2xl shadow-lg">
                <QRCodeSVG value={qrUrl} size={180} />
              </div>
              <div className="flex items-center gap-2 text-foreground-400 text-xs">
                <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                Waiting for wallet connection…
              </div>
            </div>
          )}

          {phase === "success" && (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="w-12 h-12 rounded-full bg-success-100 border border-success-300 flex items-center justify-center">
                <Check className="w-6 h-6 text-success-600" />
              </div>
              <p className="text-foreground font-medium">
                {addedCount} user{addedCount > 1 ? "s" : ""} registered!
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setPhase("idle");
                    setQrUrl("");
                  }}
                  className="px-4 py-1.5 text-sm border border-neutral-200 text-foreground-500 hover:text-foreground hover:bg-background-200 rounded-xl transition-colors"
                >
                  Invite another
                </button>
                <button
                  onClick={onNext}
                  className="px-5 py-1.5 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  Continue →
                </button>
              </div>
            </div>
          )}

          {phase === "failure" && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <p className="text-danger-600 text-sm">
                Invitation timed out or failed.
              </p>
              <button
                onClick={() => setPhase("idle")}
                className="px-4 py-1.5 text-sm border border-neutral-200 text-foreground-500 hover:text-foreground hover:bg-background-200 rounded-xl transition-colors"
              >
                Try again
              </button>
            </div>
          )}
        </>
      )}

      {/* Email tab */}
      {tab === "email" && (
        <form onSubmit={sendEmailInvite} className="space-y-4">
          <p className="text-foreground-500 text-sm">
            Send a registration link via email
          </p>

          <div className="space-y-3">
            <Field
              label="Email"
              type="email"
              value={emailForm.email}
              onChange={(e) =>
                setEmailForm({ ...emailForm, email: e.target.value })
              }
              placeholder="user@example.com"
              required
            />
            <Field
              label="Name"
              value={emailForm.name}
              onChange={(e) =>
                setEmailForm({ ...emailForm, name: e.target.value })
              }
              placeholder="John Doe"
              required
            />
            <div>
              <label className="block text-xs text-foreground-500 mb-1.5">
                Role
              </label>
              <select
                value={emailForm.role}
                onChange={(e) =>
                  setEmailForm({ ...emailForm, role: e.target.value })
                }
                className="w-full bg-background-200 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/50"
              >
                <option value="Member">Member</option>
                <option value="Admin">Admin</option>
              </select>
            </div>
          </div>

          {addedCount > 0 && (
            <p className="text-sm text-success-600">
              ✓ {addedCount} invitation{addedCount > 1 ? "s" : ""} sent
            </p>
          )}

          {emailMsg && (
            <p
              className={`text-xs px-3 py-2 rounded-xl border ${
                emailMsg.type === "ok"
                  ? "bg-success-50 border-success-300 text-success-700"
                  : "bg-danger-50 border-danger-300 text-danger-600"
              }`}
            >
              {emailMsg.text}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={emailSending || !emailForm.email || !emailForm.name}
              className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-xl disabled:opacity-40 transition-colors"
            >
              {emailSending ? "Sending…" : "Send Invitation"}
            </button>
          </div>
        </form>
      )}

      {/* Entra tab */}
      {tab === "entra" && (
        <div className="text-center py-6 space-y-4">
          <div className="text-4xl">🏢</div>
          <p className="text-foreground-500 text-sm">
            Connect Microsoft Entra ID (Azure AD) to sync users from your
            directory.
          </p>
          <p className="text-foreground-400 text-xs">
            Configure this in{" "}
            <strong className="text-foreground-500">
              Server Settings → Identity Providers
            </strong>{" "}
            after the wizard.
          </p>
        </div>
      )}

      {/* Footer — only shown when not mid-flow */}
      {(isIdle || tab === "email" || tab === "entra") && (
        <StepFooter>
          {(addedCount > 0 || tab === "email" || tab === "entra") && (
            <button
              onClick={onNext}
              className="inline-flex items-center gap-2 px-5 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-xl transition-colors"
            >
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </StepFooter>
      )}
    </div>
  );
}
