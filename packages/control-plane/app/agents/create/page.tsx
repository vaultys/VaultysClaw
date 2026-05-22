"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bot,
  Copy,
  Check,
  ChevronRight,
  Loader2,
  CheckCircle2,
  Terminal,
  Globe2,
  Cpu,
  Zap,
  FolderOpen,
  Globe,
  Monitor,
  Plug,
  Mail,
  Code,
  ToggleLeft,
  ToggleRight,
  ArrowRight,
  Wifi,
  WifiOff,
  AlertTriangle,
  MessageSquare,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminWS } from "@/hooks/useAdminWS";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Realm {
  id: string;
  name: string;
  slug: string;
  color: string;
  is_default: number;
}

interface Model {
  id: string;
  name: string;
  provider: string;
  modelId: string;
  status: string;
  litellmModelName: string | null;
}

interface Skill {
  name: string;
  enabled: boolean;
  isRequired: boolean;
  config: Record<string, unknown>;
}

interface PendingReg {
  id: string;
  agent_name: string;
  requested_capabilities: string;
  created_at: string;
}

type PkgRunner = "npx" | "pnpm" | "yarn" | "deno";

const PKG_RUNNERS: { id: PkgRunner; label: string; prefix: string }[] = [
  { id: "npx", label: "npx", prefix: "npx @vaultysclaw/agent-controller" },
  { id: "pnpm", label: "pnpm", prefix: "pnpm dlx @vaultysclaw/agent-controller" },
  { id: "yarn", label: "yarn", prefix: "yarn dlx @vaultysclaw/agent-controller" },
  { id: "deno", label: "deno", prefix: "deno run npm:@vaultysclaw/agent-controller" },
];

type WizardStep = "launch" | "waiting" | "approve" | "model" | "skills" | "verify";

const STEPS: { id: WizardStep; label: string }[] = [
  { id: "launch", label: "Launch" },
  { id: "waiting", label: "Connect" },
  { id: "approve", label: "Approve" },
  { id: "model", label: "Model" },
  { id: "skills", label: "Skills" },
  { id: "verify", label: "Verify" },
];

const STEP_INDEX: Record<WizardStep, number> = {
  launch: 0, waiting: 1, approve: 2, model: 3, skills: 4, verify: 5,
};

const ALL_CAPABILITIES = [
  { id: "file_access", label: "File access", icon: <FolderOpen size={13} /> },
  { id: "internet_access", label: "Internet access", icon: <Globe size={13} /> },
  { id: "browser_control", label: "Browser control", icon: <Monitor size={13} /> },
  { id: "api_call", label: "API calls", icon: <Plug size={13} /> },
  { id: "mail_send", label: "Mail send", icon: <Mail size={13} /> },
  { id: "code_execution", label: "Code execution", icon: <Code size={13} /> },
  { id: "system_command", label: "System command", icon: <Terminal size={13} /> },
  { id: "agent_communication", label: "Agent communication", icon: <Bot size={13} /> },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function StepBar({ current }: { current: WizardStep }) {
  const idx = STEP_INDEX[current];
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((s, i) => (
        <div key={s.id} className="flex items-center">
          <div className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
            i < idx
              ? "bg-indigo-100 dark:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400"
              : i === idx
                ? "bg-indigo-600 text-white"
                : "bg-vc-raised text-vc-subtle border border-vc-border",
          )}>
            {i < idx
              ? <Check size={11} />
              : <span className="w-3.5 h-3.5 flex items-center justify-center text-[10px] font-bold">{i + 1}</span>}
            <span>{s.label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={cn("w-6 h-px mx-1", i < idx ? "bg-indigo-300 dark:bg-indigo-700" : "bg-vc-border")} />
          )}
        </div>
      ))}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded bg-vc-raised border border-vc-border text-vc-muted hover:text-vc-text transition-colors"
    >
      {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CreateAgentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { registrations, connected: wsConnected } = useAdminWS();
  const regId = searchParams.get("regId");

  const [step, setStep] = useState<WizardStep>(regId ? "approve" : "launch");
  const [agentName, setAgentName] = useState("");
  const [wsUrl, setWsUrl] = useState("");
  const [pkgRunner, setPkgRunner] = useState<PkgRunner>("npx");
  const [realms, setRealms] = useState<Realm[]>([]);
  const [selectedLaunchRealm, setSelectedLaunchRealm] = useState<string>("");

  // Approval state
  const [pendingReg, setPendingReg] = useState<PendingReg | null>(null);
  const [selectedCaps, setSelectedCaps] = useState<Set<string>>(new Set());
  const [selectedRealms, setSelectedRealms] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);

  // Post-approval state
  const [agentDid, setAgentDid] = useState<string | null>(null);

  // Model state
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [savingModel, setSavingModel] = useState(false);

  // Skills state
  const [skills, setSkills] = useState<Skill[]>([]);
  const [savingSkills, setSavingSkills] = useState(false);

  // Verify state
  const [verifyText, setVerifyText] = useState("");
  const [verifyDone, setVerifyDone] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const verifyRef = useRef<HTMLPreElement>(null);

  // Track registrations seen before entering waiting step so we can highlight new ones
  const prevRegIds = useRef<Set<string>>(new Set());

  // ── Initial data load ──────────────────────────────────────────────────────

  useEffect(() => {
    // Compute default WS URL from current page origin
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    setWsUrl(`${proto}//${window.location.hostname}:8080`);

    fetch("/api/realms")
      .then((r) => r.json())
      .then((d: { realms?: Realm[] }) => {
        const list = d.realms ?? [];
        setRealms(list);
        const def = list.find((r) => r.is_default);
        if (def) {
          setSelectedLaunchRealm(def.id);
          setSelectedRealms(new Set([def.id]));
        }
      })
      .catch(() => { });
  }, []);

  // ── Load registration from regId query param ─────────────────────────────

  useEffect(() => {
    if (!regId || pendingReg) return;
    const reg = registrations.find((r) => r.id === regId);
    if (reg) {
      setPendingReg(reg as PendingReg);
      const caps = parseJsonArray(reg.requested_capabilities);
      setSelectedCaps(new Set(caps.length > 0 ? caps : ["agent_communication"]));
      // Realm selection will use the default (already set in initial load)
    }
  }, [regId, registrations, pendingReg]);

  // ── Detect new registrations once waiting ─────────────────────────────────

  useEffect(() => {
    if (step !== "waiting") return;
    const newReg = registrations.find((r) => !prevRegIds.current.has(r.id) && r.status === "pending");
    if (newReg && !pendingReg) {
      setPendingReg(newReg as PendingReg);
      const caps = parseJsonArray(newReg.requested_capabilities);
      setSelectedCaps(new Set(caps.length > 0 ? caps : ["agent_communication"]));
    }
  }, [registrations, step, pendingReg]);

  // ── Scroll verify output ───────────────────────────────────────────────────

  useEffect(() => {
    if (verifyRef.current) {
      verifyRef.current.scrollTop = verifyRef.current.scrollHeight;
    }
  }, [verifyText]);

  // ── Load models & skills when reaching those steps ─────────────────────────

  useEffect(() => {
    if (step === "model" && models.length === 0) {
      fetch("/api/models")
        .then((r) => r.json())
        .then((d: { models?: Model[] }) => setModels(d.models ?? []))
        .catch(() => { });
    }
  }, [step, models.length]);

  useEffect(() => {
    if (step === "skills" && agentDid && skills.length === 0) {
      fetch(`/api/agents/${encodeURIComponent(agentDid)}/skills`)
        .then((r) => r.json())
        .then((d: { skills?: Skill[] }) => setSkills(d.skills ?? []))
        .catch(() => { });
    }
  }, [step, agentDid, skills.length]);

  // ── Auto-verify on entering verify step ───────────────────────────────────

  useEffect(() => {
    if (step !== "verify" || !agentDid || verifyText || verifyDone) return;

    let cancelled = false;
    setVerifyText("");
    setVerifyDone(false);
    setVerifyError(null);

    (async () => {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentDid,
            messages: [{ role: "user", content: "List all the tools and skills you currently have access to." }],
          }),
        });
        if (!res.ok || !res.body) {
          setVerifyError(`Agent responded with HTTP ${res.status}`);
          setVerifyDone(true);
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (payload === "[DONE]") { setVerifyDone(true); return; }
            try {
              const parsed = JSON.parse(payload) as { text?: string; error?: string };
              if (parsed.error) { setVerifyError(parsed.error); setVerifyDone(true); return; }
              if (parsed.text) setVerifyText((t) => t + parsed.text);
            } catch { /* skip malformed */ }
          }
        }
        if (!cancelled) setVerifyDone(true);
      } catch (e) {
        if (!cancelled) {
          setVerifyError(e instanceof Error ? e.message : "Failed to reach agent");
          setVerifyDone(true);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [step, agentDid]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ──────────────────────────────────────────────────────────────

  function startWaiting() {
    prevRegIds.current = new Set(registrations.map((r) => r.id));
    setPendingReg(null);
    setStep("waiting");
  }

  async function doApprove() {
    if (!pendingReg) return;
    setApproving(true);
    setApproveError(null);
    try {
      const res = await fetch(`/api/registrations/${pendingReg.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capabilities: Array.from(selectedCaps),
          realmIds: Array.from(selectedRealms),
        }),
      });
      const data = await res.json() as { success?: boolean; agentDid?: string; error?: string };
      if (!res.ok || !data.success) {
        setApproveError(data.error ?? "Approval failed");
        return;
      }
      setAgentDid(data.agentDid ?? null);
      setStep("model");
    } catch {
      setApproveError("Network error");
    } finally {
      setApproving(false);
    }
  }

  async function doReject() {
    if (!pendingReg) return;
    if (!confirm(`Reject registration for "${pendingReg.agent_name}"? This cannot be undone.`)) return;
    setRejecting(true);
    setApproveError(null);
    try {
      const res = await fetch(`/api/registrations/${pendingReg.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Rejected by admin" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setApproveError(data.error ?? "Rejection failed");
        return;
      }
      router.back();
    } catch {
      setApproveError("Network error");
    } finally {
      setRejecting(false);
    }
  }

  async function saveModel() {
    if (!agentDid || !selectedModel) { setStep("skills"); return; }
    setSavingModel(true);
    try {
      await fetch(`/api/agents/${encodeURIComponent(agentDid)}/llm-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registryModelId: selectedModel }),
      });
    } finally {
      setSavingModel(false);
      setStep("skills");
    }
  }

  async function toggleSkill(skill: Skill, realmSkillId: string) {
    if (!agentDid || skill.isRequired) return;
    const newEnabled = !skill.enabled;
    setSkills((prev) => prev.map((s) => s.name === skill.name ? { ...s, enabled: newEnabled } : s));
    await fetch(`/api/agents/${encodeURIComponent(agentDid)}/skills`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ realmSkillId, enabled: newEnabled }),
    }).catch(() => { });
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const runnerPrefix = PKG_RUNNERS.find((r) => r.id === pkgRunner)!.prefix;
  const nameArg = agentName.trim();
  const cliCommand = [
    runnerPrefix,
    nameArg ? `--name "${nameArg}"` : "--name <required>",
    `--ws ${wsUrl}`,
  ].join(" \\\n  ");

  const realmNote = selectedLaunchRealm
    ? realms.find((r) => r.id === selectedLaunchRealm)?.name
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push("/agents")}
          className="text-sm text-vc-muted hover:text-vc-text transition-colors"
        >
          ← Agents
        </button>
        <span className="text-vc-border">/</span>
        <h1 className="text-sm font-semibold text-vc-text">New agent</h1>
      </div>

      <StepBar current={step} />

      {/* ── Step 1: Launch ─────────────────────────────────────────────────── */}
      {step === "launch" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-vc-text mb-1">Launch an agent</h2>
            <p className="text-sm text-vc-muted">
              An agent runs locally using the <code className="text-xs bg-vc-raised border border-vc-border px-1 py-0.5 rounded">agent-controller</code> CLI. It connects to this control plane over WebSocket and waits for admin approval.
            </p>
          </div>

          {/* WS URL */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-vc-muted uppercase tracking-wide">Control plane WebSocket URL</label>
            <input
              value={wsUrl}
              onChange={(e) => setWsUrl(e.target.value)}
              className="w-full px-3 py-2 bg-vc-surface border border-vc-border rounded-lg text-sm font-mono text-vc-text focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Agent name (required) */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-vc-muted uppercase tracking-wide">
              Agent name <span className="text-red-500">*</span>
            </label>
            <input
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="e.g. researcher"
              className={cn(
                "w-full px-3 py-2 bg-vc-surface border rounded-lg text-sm text-vc-text focus:outline-none focus:ring-2 focus:ring-indigo-500",
                agentName.trim() ? "border-vc-border" : "border-amber-400 dark:border-amber-500/60",
              )}
            />
            <p className="text-xs text-vc-subtle">
              All agent data is stored in <code className="font-mono bg-vc-raised px-1 rounded">.vaultys/{agentName.trim() || "<name>"}/</code>
            </p>
          </div>

          {/* Realm selector (cosmetic — tells admin which realm to assign during approval) */}
          {realms.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-vc-muted uppercase tracking-wide">
                Target realm <span className="normal-case font-normal">(assigned during approval)</span>
              </label>
              <select
                value={selectedLaunchRealm}
                onChange={(e) => {
                  setSelectedLaunchRealm(e.target.value);
                  if (e.target.value) setSelectedRealms(new Set([e.target.value]));
                }}
                className="w-full px-3 py-2 bg-vc-surface border border-vc-border rounded-lg text-sm text-vc-text focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">No preference</option>
                {realms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}{r.is_default ? " (default)" : ""}
                  </option>
                ))}
              </select>
              {realmNote && (
                <p className="text-xs text-vc-subtle">The agent will be enrolled in <strong>{realmNote}</strong> during the approval step.</p>
              )}
            </div>
          )}

          {/* Package runner selector + CLI command */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-vc-muted uppercase tracking-wide flex items-center gap-1.5">
                <Terminal size={12} /> CLI command
              </label>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border border-vc-border overflow-hidden text-xs">
                  {PKG_RUNNERS.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setPkgRunner(r.id)}
                      className={cn(
                        "px-2.5 py-1 font-mono transition-colors",
                        pkgRunner === r.id
                          ? "bg-indigo-600 text-white"
                          : "bg-vc-surface text-vc-muted hover:bg-vc-raised",
                      )}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                <CopyButton text={cliCommand} />
              </div>
            </div>
            <pre className="bg-vc-bg border border-vc-border rounded-xl p-4 text-sm font-mono text-vc-text-2 overflow-x-auto whitespace-pre-wrap leading-relaxed">
              {cliCommand}
            </pre>
          </div>

          {/* How it works */}
          <div className="bg-indigo-50 dark:bg-indigo-600/10 border border-indigo-200 dark:border-indigo-500/20 rounded-xl p-4 text-sm space-y-2">
            <p className="font-medium text-indigo-700 dark:text-indigo-300 flex items-center gap-2"><Zap size={14} /> How it works</p>
            <ol className="list-decimal list-inside space-y-1 text-indigo-700/80 dark:text-indigo-400/80 text-xs">
              <li>The CLI starts, creates a local identity, and connects via WebSocket</li>
              <li>The control plane receives the connection and places it in a pending queue</li>
              <li>You approve it here — assigning capabilities and a realm</li>
              <li>The agent becomes active and starts accepting instructions</li>
            </ol>
          </div>

          <div className="flex justify-end">
            <button
              onClick={startWaiting}
              disabled={!agentName.trim()}
              title={!agentName.trim() ? "Enter an agent name first" : undefined}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              I&apos;ve launched it — wait for connection <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Waiting ────────────────────────────────────────────────── */}
      {step === "waiting" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-vc-text mb-1">Waiting for agent connection</h2>
              <p className="text-sm text-vc-muted">Listening for incoming registration requests in real time.</p>
            </div>
            <span className={cn(
              "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border",
              wsConnected
                ? "bg-green-100 dark:bg-green-900/40 border-green-300 dark:border-green-700/50 text-green-700 dark:text-green-400"
                : "bg-vc-raised border-vc-border text-vc-subtle",
            )}>
              {wsConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
              {wsConnected ? "Live" : "Connecting…"}
            </span>
          </div>

          {pendingReg ? (
            <div className="bg-green-50 dark:bg-green-500/10 border-2 border-green-400 dark:border-green-500/50 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-500/20 border border-green-300 dark:border-green-500/30 flex items-center justify-center">
                  <Bot size={18} className="text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-vc-text">Agent connected!</p>
                  <p className="text-xs text-vc-muted">
                    <span className="font-medium text-green-700 dark:text-green-400">{pendingReg.agent_name}</span>
                    {" "}is waiting for approval
                  </p>
                </div>
              </div>
              <button
                onClick={() => setStep("approve")}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Approve this agent <ArrowRight size={15} />
              </button>
            </div>
          ) : (
            <div className="bg-vc-surface border border-vc-border rounded-xl p-8 flex flex-col items-center gap-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-2 border-indigo-300 dark:border-indigo-600 flex items-center justify-center">
                  <Bot size={28} className="text-indigo-400" />
                </div>
                <span className="absolute -top-1 -right-1 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-indigo-500" />
                </span>
              </div>
              <p className="text-sm text-vc-muted text-center">
                Waiting for an agent to call home…<br />
                <span className="text-xs text-vc-subtle">Make sure the CLI is running and points to the correct WebSocket URL.</span>
              </p>
            </div>
          )}

          {/* Show all pending registrations if more than one */}
          {registrations.filter((r) => r.status === "pending").length > 1 && (
            <div className="space-y-2">
              <p className="text-xs text-vc-muted uppercase tracking-wide font-medium">All pending registrations</p>
              {registrations.filter((r) => r.status === "pending").map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setPendingReg(r as PendingReg);
                    const caps = parseJsonArray(r.requested_capabilities);
                    setSelectedCaps(new Set(caps.length > 0 ? caps : ["agent_communication"]));
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-3 rounded-lg border text-sm transition-colors text-left",
                    pendingReg?.id === r.id
                      ? "bg-indigo-50 dark:bg-indigo-600/15 border-indigo-300 dark:border-indigo-500/40 text-vc-text"
                      : "bg-vc-surface border-vc-border hover:bg-vc-raised text-vc-text",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Bot size={14} className="text-vc-muted" />
                    {r.agent_name}
                  </span>
                  <span className="text-xs text-vc-muted">{timeAgo(r.created_at)}</span>
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => setStep("launch")}
            className="text-sm text-vc-muted hover:text-vc-text transition-colors"
          >
            ← Back to instructions
          </button>
        </div>
      )}

      {/* ── Step 3: Approve ────────────────────────────────────────────────── */}
      {step === "approve" && pendingReg && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-vc-text mb-1">Approve agent</h2>
            <p className="text-sm text-vc-muted">
              Assign capabilities and enroll in a realm.
              The agent will receive these permissions immediately upon approval.
            </p>
          </div>

          {/* Agent identity card */}
          <div className="bg-vc-surface border border-vc-border rounded-xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-600/20 border border-indigo-300 dark:border-indigo-500/30 flex items-center justify-center shrink-0">
              <Bot size={18} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-vc-text">{pendingReg.agent_name}</p>
              <p className="text-xs text-vc-muted">Registration ID: <code className="font-mono">{pendingReg.id.slice(0, 12)}…</code></p>
            </div>
          </div>

          {/* Capabilities */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-vc-muted uppercase tracking-wide">Capabilities</p>
            <div className="grid grid-cols-2 gap-2">
              {ALL_CAPABILITIES.map((cap) => {
                const checked = selectedCaps.has(cap.id);
                return (
                  <button
                    key={cap.id}
                    onClick={() => setSelectedCaps((prev) => {
                      const next = new Set(prev);
                      if (next.has(cap.id)) next.delete(cap.id); else next.add(cap.id);
                      return next;
                    })}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm text-left transition-colors",
                      checked
                        ? "bg-indigo-100 dark:bg-indigo-600/20 border-indigo-300 dark:border-indigo-500/40 text-indigo-700 dark:text-indigo-300"
                        : "bg-vc-surface border-vc-border text-vc-muted hover:bg-vc-raised",
                    )}
                  >
                    <span className={checked ? "text-indigo-500" : "text-vc-subtle"}>{cap.icon}</span>
                    {cap.label}
                    {checked && <Check size={12} className="ml-auto text-indigo-500" />}
                  </button>
                );
              })}
            </div>
            {selectedCaps.size === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <AlertTriangle size={12} /> At least one capability is required
              </p>
            )}
          </div>

          {/* Realm assignment */}
          {realms.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-vc-muted uppercase tracking-wide">Realms</p>
              <div className="space-y-1.5">
                {realms.map((r) => {
                  const checked = selectedRealms.has(r.id);
                  return (
                    <button
                      key={r.id}
                      onClick={() => setSelectedRealms((prev) => {
                        const next = new Set(prev);
                        if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
                        return next;
                      })}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-sm text-left transition-colors",
                        checked
                          ? "bg-vc-surface border-indigo-300 dark:border-indigo-500/40"
                          : "bg-vc-surface border-vc-border hover:bg-vc-raised",
                      )}
                    >
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ background: r.color }}
                      />
                      <span className={checked ? "text-vc-text" : "text-vc-muted"}>
                        {r.name}
                        {r.is_default ? <span className="ml-1.5 text-xs text-vc-subtle">(default)</span> : null}
                      </span>
                      {checked && <Check size={12} className="ml-auto text-indigo-500" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {approveError && (
            <div className="flex items-center gap-2 bg-red-50 dark:bg-red-500/10 border border-red-300 dark:border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-600 dark:text-red-400">
              <AlertTriangle size={14} />
              {approveError}
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep("waiting")}
              className="text-sm text-vc-muted hover:text-vc-text transition-colors"
            >
              ← Back
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={doReject}
                disabled={approving || rejecting}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-100 dark:bg-red-600/20 hover:bg-red-200 dark:hover:bg-red-600/30 disabled:opacity-50 disabled:cursor-not-allowed text-red-700 dark:text-red-400 text-sm font-medium rounded-lg transition-colors"
              >
                {rejecting ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />}
                {rejecting ? "Rejecting…" : "Reject"}
              </button>
              <button
                onClick={doApprove}
                disabled={approving || rejecting || selectedCaps.size === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                {approving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                {approving ? "Approving…" : "Approve agent"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 4: Model ──────────────────────────────────────────────────── */}
      {step === "model" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-vc-text mb-1">Choose a model</h2>
            <p className="text-sm text-vc-muted">
              Select the LLM this agent will use. You can change this later from the agent&apos;s config tab.
            </p>
          </div>

          {models.length === 0 ? (
            <div className="bg-vc-surface border border-vc-border rounded-xl p-6 text-center text-sm text-vc-muted">
              <Cpu size={20} className="mx-auto mb-2 text-vc-subtle" />
              No models registered yet. You can configure one later from the Model Registry.
            </div>
          ) : (
            <div className="space-y-2">
              {models.filter((m) => m.status === "active").map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedModel(m.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-sm text-left transition-colors",
                    selectedModel === m.id
                      ? "bg-indigo-50 dark:bg-indigo-600/15 border-indigo-300 dark:border-indigo-500/40"
                      : "bg-vc-surface border-vc-border hover:bg-vc-raised",
                  )}
                >
                  <Cpu size={16} className={selectedModel === m.id ? "text-indigo-500" : "text-vc-muted"} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-vc-text truncate">{m.name}</p>
                    <p className="text-xs text-vc-muted truncate">{m.provider} · {m.modelId}</p>
                  </div>
                  {selectedModel === m.id && <Check size={14} className="text-indigo-500 shrink-0" />}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep("skills")}
              className="text-sm text-vc-muted hover:text-vc-text transition-colors"
            >
              Skip for now
            </button>
            <button
              onClick={saveModel}
              disabled={savingModel}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {savingModel ? <Loader2 size={15} className="animate-spin" /> : <ChevronRight size={15} />}
              {selectedModel ? "Apply & continue" : "Continue"}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 5: Skills ─────────────────────────────────────────────────── */}
      {step === "skills" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-vc-text mb-1">Configure skills</h2>
            <p className="text-sm text-vc-muted">
              Skills are realm-level capabilities injected into the agent. Required skills cannot be disabled.
            </p>
          </div>

          {skills.length === 0 ? (
            <div className="bg-vc-surface border border-vc-border rounded-xl p-6 text-center text-sm text-vc-muted">
              <Zap size={20} className="mx-auto mb-2 text-vc-subtle" />
              No skills configured for this realm yet.
            </div>
          ) : (
            <div className="bg-vc-surface border border-vc-border rounded-xl divide-y divide-vc-border overflow-hidden">
              {skills.map((skill) => (
                <div key={skill.name} className="flex items-center justify-between px-4 py-3">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-vc-text">{skill.name}</p>
                    {skill.isRequired && (
                      <span className="text-[10px] bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30 px-1.5 py-0.5 rounded font-medium">
                        Required
                      </span>
                    )}
                  </div>
                  <button
                    disabled={skill.isRequired || savingSkills}
                    onClick={() => toggleSkill(skill, skill.name)}
                    className={cn(
                      "transition-colors",
                      skill.isRequired ? "opacity-40 cursor-not-allowed" : "hover:opacity-80",
                      skill.enabled ? "text-indigo-500" : "text-vc-border",
                    )}
                    title={skill.isRequired ? "Cannot disable required skill" : (skill.enabled ? "Disable" : "Enable")}
                  >
                    {skill.enabled
                      ? <ToggleRight size={28} />
                      : <ToggleLeft size={28} />}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep("verify")}
              className="text-sm text-vc-muted hover:text-vc-text transition-colors"
            >
              Skip for now
            </button>
            <button
              onClick={() => setStep("verify")}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Continue <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 6: Verify ─────────────────────────────────────────────────── */}
      {step === "verify" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-vc-text mb-1">Verify agent setup</h2>
            <p className="text-sm text-vc-muted">
              Sending a test prompt to confirm the agent is online and reports its tools correctly.
            </p>
          </div>

          {/* Prompt sent */}
          <div className="bg-vc-raised border border-vc-border rounded-xl px-4 py-3 flex items-start gap-3">
            <MessageSquare size={14} className="text-vc-muted shrink-0 mt-0.5" />
            <p className="text-sm text-vc-text italic">&ldquo;List all the tools and skills you currently have access to.&rdquo;</p>
          </div>

          {/* Response area */}
          <div className="bg-vc-surface border border-vc-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-vc-border bg-vc-raised">
              <Bot size={14} className="text-indigo-400" />
              <span className="text-xs font-medium text-vc-muted">Agent response</span>
              {!verifyDone && !verifyError && (
                <Loader2 size={12} className="animate-spin text-indigo-400 ml-auto" />
              )}
              {verifyDone && !verifyError && (
                <CheckCircle2 size={12} className="text-green-500 ml-auto" />
              )}
              {verifyError && (
                <AlertTriangle size={12} className="text-red-400 ml-auto" />
              )}
            </div>
            {verifyError ? (
              <div className="px-4 py-4 text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
                <AlertTriangle size={14} />
                {verifyError}
              </div>
            ) : (
              <pre
                ref={verifyRef}
                className="p-4 text-sm font-mono text-vc-text whitespace-pre-wrap break-words leading-relaxed max-h-72 overflow-y-auto"
              >
                {verifyText || <span className="text-vc-subtle animate-pulse">Waiting for response…</span>}
              </pre>
            )}
          </div>

          {verifyDone && (
            <div className="flex items-center gap-3 bg-green-50 dark:bg-green-500/10 border border-green-300 dark:border-green-500/30 rounded-xl px-4 py-3">
              <CheckCircle2 size={16} className="text-green-600 dark:text-green-400 shrink-0" />
              <p className="text-sm text-green-700 dark:text-green-300 font-medium">
                Agent is live and responding correctly.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                setVerifyText("");
                setVerifyDone(false);
                setVerifyError(null);
              }}
              className="text-sm text-vc-muted hover:text-vc-text transition-colors"
            >
              Retry
            </button>
            <button
              onClick={() => agentDid
                ? router.push(`/agents/${encodeURIComponent(agentDid)}`)
                : router.push("/agents")
              }
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Open agent page <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function parseJsonArray(raw: string): string[] {
  try { return JSON.parse(raw) ?? []; } catch { return []; }
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso.endsWith("Z") ? iso : iso + "Z").getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}
