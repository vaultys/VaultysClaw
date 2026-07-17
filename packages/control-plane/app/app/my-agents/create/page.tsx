"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Radar,
  Terminal,
  ChevronRight,
  Loader2,
  Cpu,
  CheckCircle2,
  Info,
} from "lucide-react";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import { CopyButton } from "@/components/shared";
import { userApi, unwrap, ApiError } from "@/lib/api/ts-rest/client";
import {
  discoverLocalModels,
  type LocalDiscoveryResult,
  type LocalServer,
} from "@/components/models/local-discovery";

type Step = "model" | "launch" | "done";
const STEPS = [
  { id: "model", label: "Choose model" },
  { id: "launch", label: "Launch" },
  { id: "done", label: "Done" },
];
const STEP_INDEX: Record<Step, number> = { model: 0, launch: 1, done: 2 };

interface Selection {
  server: LocalServer;
  model: string;
}

/** Env-var prefix the local agent-controller reads (see agent-controller/src/config.ts). */
function envPrefix(sel: Selection): string[] {
  const lines = [
    `LLM_PROVIDER=${sel.server.provider}`,
    `LLM_MODEL=${sel.model}`,
  ];
  // Ollama's native base already defaults to http://localhost:11434/api; passing
  // the bare host would drop the /api path (see agent-controller/src/llm.ts).
  if (sel.server.provider !== "ollama") {
    lines.push(`LLM_BASE_URL=${sel.server.baseUrl}`);
  }
  return lines;
}

/**
 * User-facing "Create agent" wizard for local AI. The user picks a locally
 * detected model, gets a one-time launch command, runs it on their machine;
 * the agent self-registers and awaits admin approval, then lands in the user's
 * personal workspace. The user never chooses capabilities.
 */
export default function CreateMyAgentPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("model");

  // Step 1 — name + local model
  const [name, setName] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<LocalDiscoveryResult[] | null>(
    null
  );
  const [selection, setSelection] = useState<Selection | null>(null);

  // Step 2 — launch command
  const [issuing, setIssuing] = useState(false);
  const [command, setCommand] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useBreadcrumbs(
    [{ label: "My Agents", href: "/app/my-agents" }, { label: "Create agent" }],
    []
  );
  useToolbar(
    { title: "Create agent", steps: { current: STEP_INDEX[step], steps: STEPS } },
    [step]
  );

  const scan = async () => {
    setScanning(true);
    try {
      setScanResults(await discoverLocalModels());
    } finally {
      setScanning(false);
    }
  };

  const generateCommand = async () => {
    if (!selection || !name.trim()) return;
    setIssuing(true);
    setError(null);
    try {
      const { token, workspaceName: ws, wsPort } = unwrap(
        await userApi.agents.createEnrollment({ body: { agentName: name.trim() } })
      );
      setWorkspaceName(ws);
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${proto}//${window.location.hostname}:${wsPort}?enroll=${token}`;
      const cmd = [
        ...envPrefix(selection),
        "npx @vaultysclaw/agent-controller",
        `  --name "${name.trim()}"`,
        `  --ws "${wsUrl}"`,
      ].join(" \\\n");
      setCommand(cmd);
      setStep("launch");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create enrollment");
    } finally {
      setIssuing(false);
    }
  };

  // Poll for the agent to appear (i.e. an admin approved it) while on the launch step.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const checkApproved = useCallback(async () => {
    if (!name.trim()) return;
    try {
      const data = unwrap(
        await userApi.agents.search({ query: { search: name.trim(), pageSize: 10 } })
      );
      if (data.items.some((a) => a.name === name.trim())) setStep("done");
    } catch {
      /* keep polling */
    }
  }, [name]);

  useEffect(() => {
    if (step !== "launch") return;
    pollRef.current = setInterval(checkApproved, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [step, checkApproved]);

  const inputCls =
    "w-full px-3 py-2 bg-background-100 border border-neutral-200 rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500";

  return (
    <div className="p-6 w-full max-w-2xl mx-auto">
      {/* ── Step 1: name + local model ─────────────────────────────────────── */}
      {step === "model" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-1">
              New local agent
            </h2>
            <p className="text-sm text-foreground-500">
              Create an agent backed by an AI model running on your own machine
              (LM Studio, Ollama, vLLM). An administrator will approve it, then
              it appears in your personal workspace.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground-500 uppercase tracking-wide">
              Agent name <span className="text-danger-500">*</span>
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. my-assistant"
              className={inputCls}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-foreground-500 uppercase tracking-wide">
                Local model <span className="text-danger-500">*</span>
              </label>
              <button
                type="button"
                onClick={scan}
                disabled={scanning}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-neutral-200 text-foreground-500 hover:text-foreground hover:bg-background-200 rounded-lg disabled:opacity-40 transition-colors"
              >
                {scanning ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Radar className="w-3.5 h-3.5" />
                )}
                {scanning ? "Scanning…" : "Scan local models"}
              </button>
            </div>

            {scanResults === null ? (
              <div className="rounded-xl border border-neutral-200 border-dashed bg-background-200/40 py-6 text-center">
                <Cpu className="w-6 h-6 text-foreground-400 mx-auto mb-1" />
                <p className="text-sm text-foreground-500">
                  Scan to discover models running locally.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {scanResults.map((r) => (
                  <div
                    key={r.server.id}
                    className="rounded-xl border border-neutral-200 bg-background-200/60 p-3"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          r.reachable ? "bg-success-500" : "bg-neutral-300"
                        }`}
                      />
                      <span className="text-sm font-medium text-foreground">
                        {r.server.label}
                      </span>
                      <code className="text-xs text-foreground-400 font-mono truncate">
                        {r.server.baseUrl}
                      </code>
                      {!r.reachable && (
                        <span className="ml-auto text-xs text-foreground-400 truncate">
                          {r.error ?? "Not detected"}
                        </span>
                      )}
                    </div>
                    {r.reachable && r.models.length === 0 && (
                      <p className="text-xs text-foreground-500">
                        Reachable, but no models loaded.
                      </p>
                    )}
                    {r.reachable && r.models.length > 0 && (
                      <div className="space-y-1">
                        {r.models.map((m) => {
                          const active =
                            selection?.server.id === r.server.id &&
                            selection?.model === m;
                          return (
                            <button
                              key={m}
                              type="button"
                              onClick={() =>
                                setSelection({ server: r.server, model: m })
                              }
                              className={`w-full text-left text-xs font-mono px-3 py-2 rounded-lg border transition-colors truncate ${
                                active
                                  ? "bg-primary-50 border-primary-400 text-primary-800"
                                  : "bg-background-100 border-neutral-200 hover:border-primary-400/50 hover:bg-primary-500/5"
                              }`}
                              title={m}
                            >
                              {m}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
                <p className="text-xs text-foreground-400">
                  Scanned from your browser. Make sure the server is running and
                  allows CORS from this page.
                </p>
              </div>
            )}
          </div>

          {error && (
            <p className="text-xs px-3 py-2 rounded-xl border bg-danger-50 border-danger-300 text-danger-600">
              {error}
            </p>
          )}

          <div className="flex justify-end">
            <button
              onClick={generateCommand}
              disabled={!name.trim() || !selection || issuing}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {issuing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Continue <ChevronRight size={16} />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: launch command + wait ──────────────────────────────────── */}
      {step === "launch" && command && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-1">
              Launch your agent
            </h2>
            <p className="text-sm text-foreground-500">
              Run this command on the machine where your local model runs. The
              link is single-use and expires in 30 minutes.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-foreground-500 uppercase tracking-wide flex items-center gap-1.5">
                <Terminal size={12} /> CLI command
              </label>
              <CopyButton text={command} />
            </div>
            <pre className="bg-background border border-neutral-200 rounded-xl p-4 text-sm font-mono text-foreground-700 overflow-x-auto whitespace-pre-wrap leading-relaxed">
              {command}
            </pre>
          </div>

          <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 text-sm space-y-1.5">
            <p className="font-medium text-primary-700 flex items-center gap-2">
              <Info size={14} /> What happens next
            </p>
            <ol className="list-decimal list-inside space-y-1 text-primary-700/80 text-xs">
              <li>The command starts the agent and connects it to this control plane.</li>
              <li>
                An administrator approves it (you don&apos;t choose its
                permissions).
              </li>
              <li>
                It joins your personal workspace
                {workspaceName ? ` “${workspaceName}”` : ""} and shows up in My
                Agents.
              </li>
            </ol>
          </div>

          <div className="flex items-center gap-2 text-sm text-foreground-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Waiting for an administrator to approve “{name.trim()}”…
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => setStep("model")}
              className="text-sm text-foreground-500 hover:text-foreground transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => router.push("/app/my-agents")}
              className="text-sm text-foreground-500 hover:text-foreground transition-colors"
            >
              Done — I&apos;ll check later
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: done ───────────────────────────────────────────────────── */}
      {step === "done" && (
        <div className="space-y-6 text-center py-8">
          <CheckCircle2 className="w-12 h-12 text-success-500 mx-auto" />
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-1">
              “{name.trim()}” is ready
            </h2>
            <p className="text-sm text-foreground-500">
              Your agent was approved and added to your workspace.
            </p>
          </div>
          <button
            onClick={() => router.push("/app/my-agents")}
            className="px-5 py-2.5 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Go to My Agents
          </button>
        </div>
      )}
    </div>
  );
}
