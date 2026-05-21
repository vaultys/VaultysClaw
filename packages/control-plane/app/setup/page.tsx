"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Cpu, Mail, Users, Bot, Check, X, ChevronRight, ChevronLeft, Shield,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

// ─── LocalStorage helpers ─────────────────────────────────────────────────────

const LS_DONE  = "vaultysclaw:wizardDone";
const LS_STATE = "vaultysclaw:wizardState";

type StepId = "model" | "email" | "users" | "agent";

interface WizardState { step: number; completed: StepId[] }

function loadWizardState(): WizardState {
  try {
    const raw = typeof window !== "undefined" && localStorage.getItem(LS_STATE);
    if (raw) return JSON.parse(raw) as WizardState;
  } catch { /* ignore */ }
  return { step: 0, completed: [] };
}

function saveWizardState(s: WizardState) {
  localStorage.setItem(LS_STATE, JSON.stringify(s));
}

// ─── Step registry ────────────────────────────────────────────────────────────

const STEPS: { id: StepId; label: string; desc: string; icon: React.ElementType }[] = [
  { id: "model",  label: "LLM Model", desc: "Connect an AI model",        icon: Cpu   },
  { id: "email",  label: "Email",     desc: "Configure SMTP",             icon: Mail  },
  { id: "users",  label: "Users",     desc: "Invite teammates",           icon: Users },
  { id: "agent",  label: "Agents",    desc: "Register your first agent",  icon: Bot   },
];
const STEP_IDS = STEPS.map((s) => s.id);

// ─── Shared helpers ───────────────────────────────────────────────────────────

function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <div>
      <label className="block text-xs text-vc-muted mb-1.5">{label}</label>
      <input
        {...props}
        className="w-full bg-vc-raised border border-vc-border rounded-xl px-3 py-2 text-sm text-vc-text placeholder:text-vc-subtle focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50"
      />
    </div>
  );
}

/** Consistent step footer: Back on left, Skip + primary CTA on right */
function StepFooter({
  onBack,
  onSkip,
  skipLabel = "Skip for now",
  children,
}: {
  onBack?: () => void;
  onSkip?: () => void;
  skipLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between pt-2 mt-1 border-t border-vc-border">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-vc-subtle hover:text-vc-muted transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
      ) : (
        <div />
      )}
      <div className="flex items-center gap-3">
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="text-sm text-vc-subtle hover:text-vc-muted transition-colors"
          >
            {skipLabel}
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

const PROVIDERS = [
  { value: "openai-compatible", label: "OpenAI-compatible" },
  { value: "openai",            label: "OpenAI"            },
  { value: "anthropic",         label: "Anthropic"         },
  { value: "google",            label: "Google"            },
  { value: "ollama",            label: "Ollama"            },
];

// ─── Step 1 — LLM Model ───────────────────────────────────────────────────────

function ModelStep({
  onNext, onSkip, onBack,
}: { onNext: () => void; onSkip: () => void; onBack?: () => void }) {
  const [name,     setName]     = useState("");
  const [provider, setProvider] = useState("openai-compatible");
  const [modelId,  setModelId]  = useState("");
  const [baseUrl,  setBaseUrl]  = useState("");
  const [apiKey,   setApiKey]   = useState("");
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");
  const [added,    setAdded]    = useState<string[]>([]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !modelId.trim() || !baseUrl.trim()) {
      setError("Name, Model ID and Base URL are required");
      return;
    }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, provider, modelId, baseUrl, apiKey: apiKey || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed"); return; }
      setAdded((a) => [...a, name]);
      setName(""); setModelId(""); setBaseUrl(""); setApiKey("");
    } catch { setError("Network error"); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <p className="text-vc-muted text-sm leading-relaxed">
        Connect an LLM so your agents can reason and act. You can register more models later from the Models page.
      </p>

      {added.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {added.map((n) => (
            <span key={n} className="flex items-center gap-1.5 text-xs bg-green-100 dark:bg-green-500/15 border border-green-300 dark:border-green-500/30 text-green-700 dark:text-green-400 px-2.5 py-1 rounded-full">
              <Check className="w-3 h-3" />{n}
            </span>
          ))}
        </div>
      )}

      <form onSubmit={handleAdd} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name *" value={name} onChange={(e) => setName(e.target.value)} placeholder="GPT-4o" />
          <div>
            <label className="block text-xs text-vc-muted mb-1.5">Provider</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full bg-vc-raised border border-vc-border rounded-xl px-3 py-2 text-sm text-vc-text focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <Field label="Model ID *" value={modelId} onChange={(e) => setModelId(e.target.value)} placeholder="gpt-4o" />
          <Field label="Base URL *" value={baseUrl}  onChange={(e) => setBaseUrl(e.target.value)}  placeholder="https://api.openai.com/v1" />
          <div className="col-span-2">
            <Field label="API Key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" />
          </div>
        </div>

        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

        <StepFooter onBack={onBack} onSkip={onSkip} skipLabel={added.length > 0 ? "Continue →" : "Skip for now"}>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl disabled:opacity-50 transition-colors"
          >
            {saving
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <Cpu className="w-4 h-4" />}
            {added.length > 0 ? "Add another" : "Register model"}
          </button>
        </StepFooter>
      </form>
    </div>
  );
}

// ─── Step 2 — Email / SMTP ────────────────────────────────────────────────────

function EmailStep({
  onNext, onSkip, onBack,
}: { onNext: () => void; onSkip: () => void; onBack?: () => void }) {
  const [host,     setHost]     = useState("");
  const [port,     setPort]     = useState("587");
  const [user,     setUser]     = useState("");
  const [password, setPassword] = useState("");
  const [from,     setFrom]     = useState("");
  const [saving,   setSaving]   = useState(false);
  const [testing,  setTesting]  = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "fail"; text: string } | null>(null);

  const flash = (type: "ok" | "fail", text: string) => {
    setMsg({ type, text });
    if (type === "ok") setTimeout(onNext, 1200);
    else setTimeout(() => setMsg(null), 3000);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      const r = await fetch("/api/server/smtp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, port: +port, secure: +port === 465, user, password, from }),
      });
      if (r.ok) flash("ok", "SMTP saved — advancing…"); else flash("fail", "Save failed");
    } catch { flash("fail", "Network error"); }
    finally { setSaving(false); }
  };

  const test = async () => {
    setTesting(true);
    try {
      const r = await fetch("/api/server/smtp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, port: +port, secure: +port === 465, user, password, from }),
      });
      const d = await r.json() as { ok?: boolean; error?: string };
      if (d.ok) flash("ok", "Connection successful"); else flash("fail", d.error ?? "Test failed");
    } catch { flash("fail", "Test failed"); }
    finally { setTesting(false); }
  };

  return (
    <form onSubmit={save} className="space-y-5">
      <p className="text-vc-muted text-sm leading-relaxed">
        Configure SMTP so VaultysClaw can send QR invite emails to new users.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Field label="SMTP Host"     value={host}     onChange={(e) => setHost(e.target.value)}     placeholder="smtp.example.com" />
        <Field label="Port"          value={port}     onChange={(e) => setPort(e.target.value)}     placeholder="587" />
        <Field label="Username"      value={user}     onChange={(e) => setUser(e.target.value)}     placeholder="user@example.com" />
        <Field label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        <div className="col-span-2">
          <Field label="From address" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="noreply@example.com" />
        </div>
      </div>

      {msg && (
        <p className={`text-xs px-3 py-2 rounded-xl border ${
          msg.type === "ok"
            ? "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700/40 text-green-700 dark:text-green-400"
            : "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700/40 text-red-600 dark:text-red-400"
        }`}>
          {msg.text}
        </p>
      )}

      <StepFooter onBack={onBack} onSkip={onSkip}>
        <button
          type="button" onClick={test} disabled={testing || !host}
          className="flex items-center gap-1.5 px-4 py-2 text-sm border border-vc-border text-vc-muted hover:text-vc-text hover:bg-vc-raised rounded-xl disabled:opacity-40 transition-colors"
        >
          {testing
            ? <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
            : <Mail className="w-3.5 h-3.5" />}
          Test
        </button>
        <button
          type="submit" disabled={saving || !host}
          className="flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl disabled:opacity-40 transition-colors"
        >
          {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
          Save & Continue
        </button>
      </StepFooter>
    </form>
  );
}

// ─── Step 3 — Users ───────────────────────────────────────────────────────────

function UsersStep({
  onNext, onSkip, onBack,
}: { onNext: () => void; onSkip: () => void; onBack?: () => void }) {
  const [tab,        setTab]        = useState<"qr" | "entra">("qr");
  const [phase,      setPhase]      = useState<"idle" | "loading" | "qr" | "success" | "failure">("idle");
  const [qrUrl,      setQrUrl]      = useState("");
  const [addedCount, setAddedCount] = useState(0);

  const startInvite = useCallback(async () => {
    setPhase("loading");
    try {
      const [inviteRes, settingsRes] = await Promise.all([
        fetch("/api/users/invite"),
        fetch("/api/server/settings"),
      ]);
      if (!inviteRes.ok) throw new Error("invite failed");
      const data = await inviteRes.json() as { connectionString: string; token: string; serverDid: string | null };
      const { walletUrl } = await settingsRes.json() as { walletUrl: string };
      const base = walletUrl ?? "https://wallet.vaultys.net";
      const didParam = data.serverDid ? `&did=${encodeURIComponent(data.serverDid)}` : "";
      setQrUrl(`${base}/#${data.connectionString}&protocol=p2p&service=auth${didParam}`);
      setPhase("qr");
      for (let i = 0; i < 180; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const r = await fetch(`/api/user/listen/${data.token}`);
        const { status: s } = await r.json() as { status: number };
        if (s === 2)  { setPhase("success"); setAddedCount((n) => n + 1); return; }
        if (s === -2) { setPhase("failure"); return; }
      }
      setPhase("failure");
    } catch { setPhase("failure"); }
  }, []);

  const isIdle = phase === "idle" || phase === "failure";

  return (
    <div className="space-y-5">
      <p className="text-vc-muted text-sm leading-relaxed">
        Invite teammates so they can manage agents and workflows alongside you.
      </p>

      {/* Tab selector */}
      <div className="flex gap-1 p-1 bg-vc-raised border border-vc-border rounded-xl">
        {(["qr", "entra"] as const).map((t) => (
          <button
            key={t} type="button" onClick={() => { setTab(t); setPhase("idle"); }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              tab === t
                ? "bg-vc-surface border border-vc-border text-vc-text shadow-sm"
                : "text-vc-muted hover:text-vc-text"
            }`}
          >
            {t === "qr" ? "QR Code Invite" : "Microsoft Entra ID"}
          </button>
        ))}
      </div>

      {/* QR tab */}
      {tab === "qr" && (
        <>
          {phase === "idle" && (
            <div className="text-center py-4 space-y-4">
              {addedCount > 0 && (
                <p className="text-sm text-green-600 dark:text-green-400">✓ {addedCount} user{addedCount > 1 ? "s" : ""} invited</p>
              )}
              <p className="text-vc-muted text-sm">Generate a one-time QR code. The user scans it with their Vaultys wallet.</p>
              <button onClick={startInvite} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors">
                {addedCount > 0 ? "Invite another" : "Generate Invite QR"}
              </button>
            </div>
          )}

          {phase === "loading" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-vc-muted text-sm">Creating secure channel…</p>
            </div>
          )}

          {phase === "qr" && (
            <div className="flex flex-col items-center gap-4 py-2">
              <div className="bg-white p-3 rounded-2xl shadow-lg">
                <QRCodeSVG value={qrUrl} size={180} />
              </div>
              <div className="flex items-center gap-2 text-vc-subtle text-xs">
                <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                Waiting for wallet connection…
              </div>
            </div>
          )}

          {phase === "success" && (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-500/15 border border-green-300 dark:border-green-500/30 flex items-center justify-center">
                <Check className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-vc-text font-medium">{addedCount} user{addedCount > 1 ? "s" : ""} registered!</p>
              <div className="flex gap-2">
                <button onClick={() => { setPhase("idle"); setQrUrl(""); }} className="px-4 py-1.5 text-sm border border-vc-border text-vc-muted hover:text-vc-text hover:bg-vc-raised rounded-xl transition-colors">
                  Invite another
                </button>
                <button onClick={onNext} className="px-5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors">
                  Continue →
                </button>
              </div>
            </div>
          )}

          {phase === "failure" && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <p className="text-red-600 dark:text-red-400 text-sm">Invitation timed out or failed.</p>
              <button onClick={() => setPhase("idle")} className="px-4 py-1.5 text-sm border border-vc-border text-vc-muted hover:text-vc-text hover:bg-vc-raised rounded-xl transition-colors">
                Try again
              </button>
            </div>
          )}
        </>
      )}

      {/* Entra tab */}
      {tab === "entra" && (
        <div className="text-center py-6 space-y-4">
          <div className="text-4xl">🏢</div>
          <p className="text-vc-muted text-sm">Connect Microsoft Entra ID (Azure AD) to sync users from your directory.</p>
          <p className="text-vc-subtle text-xs">
            Configure this in <strong className="text-vc-muted">Server Settings → Identity Providers</strong> after the wizard.
          </p>
        </div>
      )}

      {/* Footer — only shown when not mid-flow */}
      {(isIdle || tab === "entra") && (
        <StepFooter
          onBack={onBack}
          onSkip={onSkip}
          skipLabel={addedCount > 0 ? "Continue →" : "Skip for now"}
        >
          {tab === "entra" && (
            <button onClick={onSkip} className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors">
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </StepFooter>
      )}
    </div>
  );
}

// ─── Step 4 — Agents ──────────────────────────────────────────────────────────

function AgentStep({
  onSkip, onBack, onFinish,
}: { onSkip: () => void; onBack?: () => void; onFinish: () => void }) {
  return (
    <div className="space-y-5">
      <p className="text-vc-muted text-sm leading-relaxed">
        Register your first AI agent. Agents connect via WebSocket and receive tasks cryptographically signed by the control plane.
      </p>

      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: "🔗", title: "Install SDK",  desc: "Add the VaultysClaw agent package to your project." },
          { icon: "🔑", title: "Register",     desc: "Agent presents its VaultysID — you approve it here." },
          { icon: "🎛️", title: "Assign caps",  desc: "Control what tools and resources each agent can use." },
        ].map(({ icon, title, desc }) => (
          <div key={title} className="bg-vc-raised border border-vc-border rounded-xl p-3 text-center">
            <div className="text-2xl mb-2">{icon}</div>
            <p className="text-xs font-semibold text-vc-text mb-1">{title}</p>
            <p className="text-xs text-vc-muted leading-snug">{desc}</p>
          </div>
        ))}
      </div>

      <StepFooter onBack={onBack} onSkip={onSkip}>
        <button
          onClick={onFinish}
          className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors"
        >
          <Bot className="w-4 h-4" /> Create first agent
        </button>
      </StepFooter>
    </div>
  );
}

// ─── Done screen ──────────────────────────────────────────────────────────────

function DoneStep({ completedSteps, onClose }: { completedSteps: Set<StepId>; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6 py-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-indigo-100 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-400/30 flex items-center justify-center">
        <Shield className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-vc-text">VaultysClaw is ready!</h2>
        <p className="text-vc-muted text-sm mt-2 max-w-sm mx-auto">
          Your control plane is configured. Every setting is adjustable at any time from the sidebar.
        </p>
      </div>

      <div className="w-full space-y-2 text-left">
        {STEPS.map(({ id, label, icon: Icon }) => {
          const done = completedSteps.has(id);
          return (
            <div
              key={id}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${
                done
                  ? "bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/25 text-green-700 dark:text-green-400"
                  : "bg-vc-raised border-vc-border text-vc-muted"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1 font-medium">{label}</span>
              {done
                ? <Check className="w-4 h-4 shrink-0" />
                : <span className="text-xs opacity-60">skipped</span>}
            </div>
          );
        })}
      </div>

      <button
        onClick={onClose}
        className="mt-2 px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-indigo-600/20"
      >
        Launch dashboard
      </button>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({
  currentIdx,
  done,
  completedSteps,
  onGoToStep,
  onFinishLater,
}: {
  currentIdx: number;
  done: boolean;
  completedSteps: Set<StepId>;
  onGoToStep: (idx: number) => void;
  onFinishLater: () => void;
}) {
  return (
    <aside className="hidden md:flex flex-col w-60 shrink-0 bg-vc-surface border-r border-vc-border p-6 gap-8">
      {/* Logo */}
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center text-sm leading-none shadow shadow-indigo-600/30">
          🦞
        </div>
        <span className="font-bold text-vc-text tracking-tight">VaultysClaw</span>
      </div>

      {/* Steps nav */}
      <div>
        <p className="text-vc-subtle text-[10px] font-bold uppercase tracking-widest mb-3 px-1">Setup</p>
        <nav className="space-y-0.5">
          {STEPS.map(({ id, label, desc, icon: Icon }, idx) => {
            const isActive    = !done && idx === currentIdx;
            const isPast      = done || idx < currentIdx;
            const isCompleted = completedSteps.has(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => !done && onGoToStep(idx)}
                disabled={done}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left ${
                  done ? "cursor-default" : "cursor-pointer"
                } ${
                  isActive
                    ? "bg-indigo-50 dark:bg-indigo-600/20 border border-indigo-200 dark:border-indigo-500/40 text-indigo-900 dark:text-white"
                    : isPast && isCompleted
                    ? "text-green-600 dark:text-green-400 hover:bg-vc-raised"
                    : !done
                    ? "text-vc-subtle hover:bg-vc-raised hover:text-vc-muted"
                    : "text-vc-subtle"
                }`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border transition-all ${
                  isActive
                    ? "bg-indigo-600 border-indigo-500 text-white"
                    : isPast && isCompleted
                    ? "bg-green-100 dark:bg-green-500/15 border-green-200 dark:border-green-500/30 text-green-600 dark:text-green-400"
                    : "bg-vc-raised border-vc-border text-vc-subtle"
                }`}>
                  {isPast && isCompleted
                    ? <Check className="w-3.5 h-3.5" />
                    : <Icon className="w-3.5 h-3.5" />}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">{label}</p>
                  <p className={`text-[10px] truncate ${
                    isActive ? "text-indigo-600/70 dark:text-indigo-300/60" : "text-vc-subtle"
                  }`}>{desc}</p>
                </div>
                {isActive && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400 shrink-0 animate-pulse" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Finish later */}
      <div className="mt-auto space-y-3">
        <button
          onClick={onFinishLater}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-vc-muted hover:text-vc-text border border-vc-border hover:bg-vc-raised rounded-xl transition-colors"
        >
          <X className="w-3.5 h-3.5" /> Finish later
        </button>
        <p className="text-vc-subtle text-[10px] text-center leading-relaxed opacity-70">
          Your progress is saved. Return from the dashboard banner.
        </p>
      </div>
    </aside>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SetupPage() {
  const router = useRouter();
  const [loading,        setLoading]        = useState(true);
  const [currentIdx,     setCurrentIdx]     = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<StepId>>(new Set());
  const [done,           setDone]           = useState(false);

  useEffect(() => {
    if (localStorage.getItem(LS_DONE)) {
      router.replace("/");
      return;
    }
    const state = loadWizardState();
    setCurrentIdx(state.step);
    setCompletedSteps(new Set(state.completed));
    setLoading(false);
  }, [router]);

  const currentStep = STEP_IDS[currentIdx];

  /** Jump to any step (preserves completion state) */
  const goToStep = (idx: number) => {
    if (done) return;
    setCurrentIdx(idx);
    saveWizardState({ step: idx, completed: [...completedSteps] });
  };

  const goBack = () => {
    if (currentIdx > 0) goToStep(currentIdx - 1);
  };

  /** Advance to next step, optionally marking current as complete */
  const advance = (completed: boolean) => {
    const newSet = completed
      ? new Set([...completedSteps, currentStep])
      : completedSteps;
    if (completed) setCompletedSteps(newSet);
    const nextIdx = currentIdx + 1;
    if (nextIdx < STEP_IDS.length) {
      setCurrentIdx(nextIdx);
      saveWizardState({ step: nextIdx, completed: [...newSet] });
    } else {
      setDone(true);
      saveWizardState({ step: nextIdx, completed: [...newSet] });
    }
  };

  /** Fully finish — sets done flag */
  const finish = (target: string = "/") => {
    localStorage.setItem(LS_DONE, "1");
    router.push(target);
  };

  /** Save progress and return to dashboard — banner will reappear */
  const finishLater = () => router.push("/");

  if (loading) return null;

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-indigo-50/70 via-white to-purple-50/40 dark:from-gray-950 dark:via-indigo-950 dark:to-gray-950">
      {/* Ambient blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[450px] bg-indigo-200/40 dark:bg-indigo-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-purple-200/30 dark:bg-purple-600/8 rounded-full blur-3xl" />
      </div>

      {/* Sidebar */}
      <Sidebar
        currentIdx={currentIdx}
        done={done}
        completedSteps={completedSteps}
        onGoToStep={goToStep}
        onFinishLater={finishLater}
      />

      {/* Main content */}
      <div className="relative flex-1 flex flex-col min-h-screen">
        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between px-5 py-4 bg-vc-surface border-b border-vc-border">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center text-xs shadow shadow-indigo-600/30">🦞</div>
            <span className="font-bold text-vc-text text-sm">VaultysClaw Setup</span>
          </div>
          <button
            onClick={finishLater}
            className="text-xs text-vc-muted hover:text-vc-text border border-vc-border hover:bg-vc-raised px-3 py-1.5 rounded-lg transition-colors"
          >
            Finish later
          </button>
        </header>

        {/* Content area */}
        <div className="flex-1 flex items-center justify-center p-6 md:p-12">
          <div className="w-full max-w-xl animate-fade-in-up">
            {done ? (
              <DoneStep completedSteps={completedSteps} onClose={() => finish("/")} />
            ) : (
              <>
                {/* Step header */}
                <div className="flex items-center justify-between mb-1">
                  <span className="text-vc-subtle text-xs font-semibold uppercase tracking-widest">
                    Step {currentIdx + 1} of {STEP_IDS.length}
                  </span>
                  {/* Mobile back link */}
                  {currentIdx > 0 && (
                    <button
                      onClick={goBack}
                      className="md:hidden flex items-center gap-1 text-xs text-vc-subtle hover:text-vc-muted transition-colors"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" /> Back
                    </button>
                  )}
                </div>
                <h1 className="text-2xl font-bold text-vc-text mb-1">{STEPS[currentIdx].label}</h1>
                <p className="text-vc-muted text-sm mb-6">{STEPS[currentIdx].desc}</p>

                {/* Step card */}
                <div className="bg-vc-surface border border-vc-border rounded-2xl p-6 shadow-sm">
                  {currentStep === "model" && (
                    <ModelStep
                      onNext={() => advance(true)}
                      onSkip={() => advance(false)}
                      onBack={currentIdx > 0 ? goBack : undefined}
                    />
                  )}
                  {currentStep === "email" && (
                    <EmailStep
                      onNext={() => advance(true)}
                      onSkip={() => advance(false)}
                      onBack={goBack}
                    />
                  )}
                  {currentStep === "users" && (
                    <UsersStep
                      onNext={() => advance(true)}
                      onSkip={() => advance(false)}
                      onBack={goBack}
                    />
                  )}
                  {currentStep === "agent" && (
                    <AgentStep
                      onSkip={() => advance(false)}
                      onBack={goBack}
                      onFinish={() => finish("/agents/create")}
                    />
                  )}
                </div>

                {/* Mobile step dots */}
                <div className="flex items-center justify-center gap-2 mt-6 md:hidden">
                  {STEPS.map((s, i) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => goToStep(i)}
                      className={`rounded-full transition-all ${
                        i === currentIdx ? "w-4 h-2 bg-indigo-500 dark:bg-indigo-400" :
                        i < currentIdx   ? "w-2 h-2 bg-indigo-400/60 dark:bg-indigo-600/60" :
                                           "w-2 h-2 bg-vc-border"
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
