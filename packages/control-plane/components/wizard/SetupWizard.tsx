"use client";

import React, { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Cpu, Mail, Users, Bot, Check, X, ChevronRight } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

// ─── Types ────────────────────────────────────────────────────────────────────

type StepId = "model" | "email" | "users" | "agent";

const STEPS: { id: StepId; label: string; icon: React.ElementType }[] = [
  { id: "model", label: "LLM Model", icon: Cpu },
  { id: "email", label: "Email", icon: Mail },
  { id: "users", label: "Users", icon: Users },
  { id: "agent", label: "Agents", icon: Bot },
];

const PROVIDERS = [
  { value: "openai-compatible", label: "OpenAI-compatible" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google" },
  { value: "ollama", label: "Ollama" },
];

// ─── Shared input ─────────────────────────────────────────────────────────────

function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <div>
      <label className="block text-xs text-foreground-500 mb-1.5">{label}</label>
      <input
        {...props}
        className="w-full bg-background-200 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50"
      />
    </div>
  );
}

// ─── Step 1 — LLM Model ───────────────────────────────────────────────────────

function ModelStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("openai-compatible");
  const [modelId, setModelId] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [added, setAdded] = useState<string[]>([]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !modelId.trim() || !baseUrl.trim()) {
      setError("Name, Model ID, and Base URL are required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, provider, modelId, baseUrl, apiKey: apiKey || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to register model"); return; }
      setAdded((a) => [...a, name]);
      setName(""); setModelId(""); setBaseUrl(""); setApiKey("");
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-foreground-500 text-sm">Connect an LLM so your agents can reason and act. You can register more models later.</p>

      {added.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {added.map((n) => (
            <span key={n} className="flex items-center gap-1 text-xs bg-green-100 dark:bg-green-900/40 border border-green-300 dark:border-green-700 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full">
              <Check className="w-3 h-3" />{n}
            </span>
          ))}
        </div>
      )}

      <form onSubmit={handleAdd} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name *" value={name} onChange={(e) => setName(e.target.value)} placeholder="GPT-4o" />
          <div>
            <label className="block text-xs text-foreground-500 mb-1.5">Provider</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full bg-background-200 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <Field label="Model ID *" value={modelId} onChange={(e) => setModelId(e.target.value)} placeholder="gpt-4o" />
          <Field label="Base URL *" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" />
          <div className="col-span-2">
            <Field label="API Key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" />
          </div>
        </div>

        {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}

        <div className="flex items-center justify-between pt-1">
          <button type="button" onClick={onSkip} className="text-sm text-foreground-500 hover:text-foreground transition-colors">
            Skip for now
          </button>
          <div className="flex gap-2">
            {added.length > 0 && (
              <button type="button" onClick={onNext} className="px-4 py-2 text-sm border border-neutral-200 text-foreground-500 hover:text-foreground rounded-xl hover:bg-background-200 transition-colors">
                Continue →
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl disabled:opacity-50 transition-colors"
            >
              {saving
                ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <Cpu className="w-4 h-4" />}
              {added.length > 0 ? "Add another" : "Register model"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

// ─── Step 2 — Email / SMTP ────────────────────────────────────────────────────

function EmailStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [from, setFrom] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "fail"; text: string } | null>(null);

  const flash = (type: "ok" | "fail", text: string) => {
    setMsg({ type, text });
    if (type === "ok") setTimeout(onNext, 1200);
    else setTimeout(() => setMsg(null), 3000);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
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
    <form onSubmit={save} className="space-y-4">
      <p className="text-foreground-500 text-sm">Configure SMTP so VaultysClaw can send invite emails to new users.</p>

      <div className="grid grid-cols-2 gap-3">
        <Field label="SMTP Host" value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.example.com" />
        <Field label="Port" value={port} onChange={(e) => setPort(e.target.value)} placeholder="587" />
        <Field label="Username" value={user} onChange={(e) => setUser(e.target.value)} placeholder="user@example.com" />
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

      <div className="flex items-center justify-between pt-1">
        <button type="button" onClick={onSkip} className="text-sm text-foreground-500 hover:text-foreground transition-colors">
          Skip for now
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={test}
            disabled={testing || !host}
            className="flex items-center gap-1.5 px-4 py-2 text-sm border border-neutral-200 text-foreground-500 hover:text-foreground hover:bg-background-200 rounded-xl disabled:opacity-40 transition-colors"
          >
            {testing
              ? <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
              : <Mail className="w-3.5 h-3.5" />}
            Test
          </button>
          <button
            type="submit"
            disabled={saving || !host}
            className="flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl disabled:opacity-40 transition-colors"
          >
            {saving && <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            Save & Continue
          </button>
        </div>
      </div>
    </form>
  );
}

// ─── Step 3 — Users ───────────────────────────────────────────────────────────

function UsersStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [tab, setTab] = useState<"qr" | "entra">("qr");
  const [phase, setPhase] = useState<"idle" | "loading" | "qr" | "success" | "failure">("idle");
  const [qrUrl, setQrUrl] = useState("");
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
        if (s === 2) { setPhase("success"); setAddedCount((n) => n + 1); return; }
        if (s === -2) { setPhase("failure"); return; }
      }
      setPhase("failure");
    } catch { setPhase("failure"); }
  }, []);

  return (
    <div className="space-y-4">
      <p className="text-foreground-500 text-sm">Invite teammates so they can manage agents and workflows.</p>

      <div className="flex gap-1 p-1 bg-background-200 border border-neutral-200 rounded-xl">
        {(["qr", "entra"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              tab === t ? "bg-background-100 border border-neutral-200 text-foreground shadow-sm" : "text-foreground-500 hover:text-foreground"
            }`}
          >
            {t === "qr" ? "QR Code Invite" : "Microsoft Entra ID"}
          </button>
        ))}
      </div>

      {tab === "qr" && (
        <>
          {phase === "idle" && (
            <div className="text-center py-4 space-y-3">
              {addedCount > 0 && (
                <p className="text-sm text-green-600 dark:text-green-400">✓ {addedCount} user{addedCount > 1 ? "s" : ""} invited</p>
              )}
              <p className="text-foreground-500 text-sm">Generate a one-time QR code. The user scans it with their Vaultys wallet.</p>
              <button
                onClick={startInvite}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors"
              >
                {addedCount > 0 ? "Invite another" : "Generate Invite QR"}
              </button>
            </div>
          )}

          {phase === "loading" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-foreground-500 text-sm">Creating secure channel…</p>
            </div>
          )}

          {phase === "qr" && (
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="bg-white p-3 rounded-xl shadow-sm">
                <QRCodeSVG value={qrUrl} size={172} />
              </div>
              <div className="flex items-center gap-2 text-foreground-400 text-xs">
                <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                Waiting for wallet connection…
              </div>
            </div>
          )}

          {phase === "success" && (
            <div className="flex flex-col items-center gap-3 py-3 text-center">
              <div className="w-11 h-11 rounded-full bg-green-100 dark:bg-green-900/40 border border-green-300 dark:border-green-700 flex items-center justify-center">
                <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-foreground font-medium text-sm">{addedCount} user{addedCount > 1 ? "s" : ""} registered!</p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setPhase("idle"); setQrUrl(""); }}
                  className="px-4 py-1.5 text-sm border border-neutral-200 text-foreground-500 hover:text-foreground rounded-xl hover:bg-background-200 transition-colors"
                >
                  Invite another
                </button>
                <button
                  onClick={onNext}
                  className="px-5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  Continue →
                </button>
              </div>
            </div>
          )}

          {phase === "failure" && (
            <div className="flex flex-col items-center gap-3 py-3 text-center">
              <p className="text-red-500 dark:text-red-400 text-sm">Invitation timed out or failed.</p>
              <button
                onClick={() => setPhase("idle")}
                className="px-4 py-1.5 text-sm border border-neutral-200 text-foreground-500 hover:text-foreground rounded-xl hover:bg-background-200 transition-colors"
              >
                Try again
              </button>
            </div>
          )}

          {(phase === "idle" || phase === "failure") && (
            <div className="flex justify-start pt-1">
              <button
                type="button"
                onClick={addedCount > 0 ? onNext : onSkip}
                className="text-sm text-foreground-500 hover:text-foreground transition-colors"
              >
                {addedCount > 0 ? "Continue →" : "Skip for now"}
              </button>
            </div>
          )}
        </>
      )}

      {tab === "entra" && (
        <div className="text-center py-6 space-y-3">
          <div className="text-4xl">🏢</div>
          <p className="text-foreground-500 text-sm">Connect Microsoft Entra ID (Azure AD) to sync users from your directory.</p>
          <p className="text-foreground-400 text-xs">
            Configure this in <strong className="text-foreground-500">Server Settings → Identity Providers</strong> after the wizard.
          </p>
          <button
            onClick={onSkip}
            className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors"
          >
            Continue <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Step 4 — Agents ──────────────────────────────────────────────────────────

function AgentStep({ onSkip, onDismiss }: { onSkip: () => void; onDismiss: () => void }) {
  const router = useRouter();
  return (
    <div className="space-y-4">
      <p className="text-foreground-500 text-sm">Register your first AI agent. Agents connect via WebSocket and receive tasks from VaultysClaw.</p>

      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: "🔗", title: "Install SDK", desc: "Add the VaultysClaw agent package to your app." },
          { icon: "🔑", title: "Register", desc: "Agent presents its VaultysID — you approve it here." },
          { icon: "🎛️", title: "Assign caps", desc: "Control what tools each agent can access." },
        ].map(({ icon, title, desc }) => (
          <div key={title} className="bg-background-200 border border-neutral-200 rounded-xl p-3 text-center">
            <div className="text-2xl mb-2">{icon}</div>
            <p className="text-xs font-semibold text-foreground mb-1">{title}</p>
            <p className="text-xs text-foreground-500 leading-snug">{desc}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-1">
        <button type="button" onClick={onSkip} className="text-sm text-foreground-500 hover:text-foreground transition-colors">
          Skip for now
        </button>
        <button
          onClick={() => { onDismiss(); router.push("/agents/create"); }}
          className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors"
        >
          <Bot className="w-4 h-4" /> Create first agent
        </button>
      </div>
    </div>
  );
}

// ─── Done screen ──────────────────────────────────────────────────────────────

function DoneStep({ completedSteps, onClose }: { completedSteps: Set<StepId>; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center gap-5 py-2 text-center">
      <div className="w-14 h-14 rounded-full bg-indigo-100 dark:bg-indigo-900/40 border border-indigo-300 dark:border-indigo-700 flex items-center justify-center">
        <Check className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
      </div>
      <div>
        <h3 className="text-base font-bold text-foreground">VaultysClaw is ready!</h3>
        <p className="text-foreground-500 text-sm mt-1 max-w-xs mx-auto">
          Your control plane is configured. Adjust any setting at any time from the sidebar.
        </p>
      </div>
      <div className="w-full space-y-2 text-left">
        {STEPS.map(({ id, label, icon: Icon }) => {
          const done = completedSteps.has(id);
          return (
            <div
              key={id}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl border text-sm ${
                done
                  ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700/40 text-green-700 dark:text-green-400"
                  : "bg-background-200 border-neutral-200 text-foreground-500"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{label}</span>
              {done
                ? <Check className="w-4 h-4 shrink-0 text-green-600 dark:text-green-400" />
                : <span className="text-xs opacity-60">skipped</span>}
            </div>
          );
        })}
      </div>
      <button
        onClick={onClose}
        className="mt-1 px-7 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition-colors shadow shadow-indigo-600/20"
      >
        Launch dashboard
      </button>
    </div>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ currentIdx, completedSteps }: { currentIdx: number; completedSteps: Set<StepId> }) {
  return (
    <div className="px-6 pt-5">
      <div className="flex items-start">
        {STEPS.map(({ id, label, icon: Icon }, idx) => {
          const isActive = idx === currentIdx;
          const isPast = idx < currentIdx;
          const isCompleted = completedSteps.has(id);
          return (
            <React.Fragment key={id}>
              <div className="flex flex-col items-center gap-1.5">
                <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                  isActive
                    ? "border-indigo-500 bg-indigo-500 text-white"
                    : isPast && isCompleted
                    ? "border-green-500 bg-green-500 text-white"
                    : isPast
                    ? "border-neutral-200 bg-background-200 text-foreground-500"
                    : "border-neutral-200 bg-background-100 text-foreground-400"
                }`}>
                  {isPast && isCompleted ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>
                <span className={`text-[10px] font-medium whitespace-nowrap ${
                  isActive ? "text-indigo-500 dark:text-indigo-400" : isPast ? "text-foreground-500" : "text-foreground-400"
                }`}>
                  {label}
                </span>
              </div>
              {idx < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mt-4 mx-1 transition-colors duration-500 ${
                  idx < currentIdx ? "bg-indigo-500" : "bg-background-200"
                }`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ─── Wizard shell ─────────────────────────────────────────────────────────────

const STEP_ORDER: StepId[] = ["model", "email", "users", "agent"];

export default function SetupWizard({ onClose }: { onClose: () => void }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [done, setDone] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<Set<StepId>>(new Set());

  const currentStep = STEP_ORDER[currentIdx];

  const advance = (completed: boolean) => {
    if (completed) setCompletedSteps((s) => new Set([...s, currentStep]));
    if (currentIdx < STEP_ORDER.length - 1) setCurrentIdx((i) => i + 1);
    else setDone(true);
  };

  const dismiss = () => {
    localStorage.setItem("vaultysclaw:wizardDismissed", "1");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-background-100 border border-neutral-200 rounded-2xl shadow-2xl w-full max-w-xl animate-fade-in-up">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
          <div>
            <h2 className="font-bold text-foreground">Setup VaultysClaw</h2>
            <p className="text-foreground-400 text-xs mt-0.5">
              {done ? "All done!" : `Step ${currentIdx + 1} of ${STEP_ORDER.length}`}
            </p>
          </div>
          <button
            onClick={dismiss}
            aria-label="Close"
            className="p-1.5 text-foreground-500 hover:text-foreground rounded-lg hover:bg-background-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress */}
        {!done && <ProgressBar currentIdx={currentIdx} completedSteps={completedSteps} />}

        {/* Content */}
        <div className="px-6 py-5">
          {done ? (
            <DoneStep completedSteps={completedSteps} onClose={dismiss} />
          ) : (
            <>
              <h3 className="text-sm font-semibold text-foreground mb-3">{STEPS[currentIdx].label}</h3>
              {currentStep === "model" && <ModelStep onNext={() => advance(true)} onSkip={() => advance(false)} />}
              {currentStep === "email" && <EmailStep onNext={() => advance(true)} onSkip={() => advance(false)} />}
              {currentStep === "users" && <UsersStep onNext={() => advance(true)} onSkip={() => advance(false)} />}
              {currentStep === "agent" && <AgentStep onSkip={() => advance(false)} onDismiss={dismiss} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
