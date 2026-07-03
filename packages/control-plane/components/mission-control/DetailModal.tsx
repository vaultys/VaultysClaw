"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Bot,
  CheckCircle,
  Clock,
  Cpu,
  Globe2,
  Loader2,
  Shield,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import {
  durationBetween,
  formatCompactNumber,
  shortDid,
  timeAgo,
} from "@vaultysclaw/shared";
import type { AgentInfo } from "@/lib/contracts";
import {
  userApi,
  unwrap,
} from "@/lib/api/ts-rest/client";
import {
  agentLabel,
  STATUS_COLOR,
  type DetailItem,
  type Intent,
  type WorkflowRun,
  type WorkflowStep,
} from "./types";
import { Row } from "./ui";

function stepIcon(status: string) {
  if (status === "success" || status === "completed")
    return <CheckCircle size={10} className="text-success-600 shrink-0" />;
  if (status === "failed")
    return <XCircle size={10} className="text-danger-600 shrink-0" />;
  if (status === "running")
    return (
      <Loader2 size={10} className="text-primary-600 animate-spin shrink-0" />
    );
  return <Clock size={10} className="text-foreground-500 shrink-0" />;
}

function stepBorder(status: string): string {
  if (status === "failed") return "border-danger-500/40 bg-danger-500/5";
  if (status === "success" || status === "completed")
    return "border-success-500/30 bg-success-500/5";
  if (status === "running") return "border-primary-500/40 bg-primary-500/5";
  return "border-neutral-200/40 bg-background-100/30";
}

function AgentDetail({
  agent,
  onClose,
}: {
  agent: AgentInfo | undefined;
  onClose: () => void;
}) {
  const router = useRouter();
  if (!agent)
    return <p className="p-6 text-foreground-600 text-sm">Agent not found.</p>;

  const day = agent.tokenHistory?.find((th) => th.granularity === "day");
  const totalDaily = (day?.promptTokens ?? 0) + (day?.completionTokens ?? 0);

  return (
    <>
      <div className="px-5 pt-5 pb-4 border-b border-neutral-200/40">
        <div className="flex items-center gap-3 pr-6">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            {agent.online && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success-600 opacity-75" />
            )}
            <span
              className={`relative inline-flex rounded-full h-2.5 w-2.5 ${agent.online ? "bg-success-600" : "bg-foreground-300"}`}
            />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground truncate">
              {agent.name}
            </p>
            <p className="text-[10px] text-foreground-500 font-mono truncate">
              {shortDid(agent.did)}
            </p>
          </div>
        </div>
      </div>

      <div className="px-5 py-4 space-y-3 text-[11px]">
        {agent.reportedLlm && (
          <Row icon={<Cpu size={11} />} label="Model">
            <span className="text-primary-600 font-semibold">
              {agent.reportedLlm.model}
            </span>
            <span className="text-foreground-500 ml-1">
              via {agent.reportedLlm.provider}
            </span>
          </Row>
        )}
        {(agent.agentWorkspaces ?? []).length > 0 && (
          <Row icon={<Globe2 size={11} />} label="Workspaces">
            <div className="flex flex-wrap gap-1">
              {(agent.agentWorkspaces ?? []).map((r) => (
                <span
                  key={r.workspaceId}
                  className="px-1.5 py-0.5 rounded text-[10px] border"
                  style={{
                    color: r.workspace.color,
                    borderColor: `${r.workspace.color}50`,
                    background: `${r.workspace.color}18`,
                  }}
                >
                  {r.workspace.name}
                </span>
              ))}
            </div>
          </Row>
        )}
        <Row icon={<Shield size={11} />} label="Capabilities">
          <div className="flex flex-wrap gap-1">
            {agent.capabilities.map((c) => (
              <span
                key={c}
                className="px-1.5 py-0.5 rounded bg-background-200 text-foreground-600 text-[10px]"
              >
                {c}
              </span>
            ))}
          </div>
        </Row>
        {totalDaily > 0 && (
          <Row icon={<Zap size={11} />} label="Tokens today">
            <span className="text-foreground">
              {formatCompactNumber(totalDaily)}
            </span>
            {agent.dailyPriceSpent != null && agent.dailyPriceSpent > 0 && (
              <span className="ml-2 text-warning-600">
                ${agent.dailyPriceSpent.toFixed(4)}
              </span>
            )}
          </Row>
        )}
        <Row icon={<Clock size={11} />} label="Last heartbeat">
          <span className="text-foreground-600">
            {timeAgo(agent.lastHeartbeat)}
          </span>
          {agent.connectedAt && (
            <span className="text-foreground-500 ml-2">
              · connected {timeAgo(agent.connectedAt)}
            </span>
          )}
        </Row>
      </div>

      <div className="px-5 pb-4 pt-2 border-t border-neutral-200/40 flex items-center justify-between">
        <span className="text-[10px] text-foreground-500">
          {agent.online ? "● online" : "○ offline"}
        </span>
        <button
          onClick={() => {
            onClose();
            router.push(`/admin/agents/${encodeURIComponent(agent.did)}`);
          }}
          className="flex items-center gap-1.5 text-[11px] text-primary-600 hover:text-primary-700 font-medium transition-colors"
        >
          View full agent <ArrowUpRight size={11} />
        </button>
      </div>
    </>
  );
}

function WorkflowDetail({
  run,
  agents,
  onClose,
}: {
  run: WorkflowRun | undefined;
  agents: AgentInfo[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [steps, setSteps] = useState<WorkflowStep[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!run) return;
    setLoading(true);
    userApi.workflowRuns
      .getOne({ params: { runId: run.id } })
      .then((r) => setSteps(unwrap(r).steps))
      .catch(() => setSteps([]))
      .finally(() => setLoading(false));
  }, [run]);

  if (!run)
    return <p className="p-6 text-foreground-600 text-sm">Run not found.</p>;

  return (
    <>
      <div className="px-5 pt-5 pb-3 border-b border-neutral-200/40 pr-10 shrink-0">
        <p className="text-sm font-bold text-foreground truncate">
          {run.workflowName ?? "Workflow"}
        </p>
        <div className="flex items-center gap-3 mt-1 text-[10px]">
          <span
            className={`font-semibold ${STATUS_COLOR[run.status] ?? "text-foreground-600"}`}
          >
            {run.status}
          </span>
          <span className="text-foreground-500">{timeAgo(run.startedAt)}</span>
          <span className="text-foreground-600">
            {durationBetween(run.startedAt, run.completedAt)}
          </span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5 min-h-0">
        {loading ? (
          <div className="flex items-center gap-2 text-[11px] text-foreground-600 py-2">
            <Loader2 size={11} className="animate-spin" /> Loading steps…
          </div>
        ) : steps && steps.length > 0 ? (
          steps.map((step) => (
            <div
              key={step.id}
              className={`rounded-lg border px-3 py-2 text-[11px] ${stepBorder(step.status)}`}
            >
              <div className="flex items-center gap-2">
                {stepIcon(step.status)}
                <span className="font-medium text-foreground flex-1 truncate">
                  {step.stepId}
                </span>
                {step.startedAt && step.completedAt && (
                  <span className="text-[10px] text-foreground-600 shrink-0">
                    {durationBetween(step.startedAt, step.completedAt)}
                  </span>
                )}
              </div>
              {step.agentId && (
                <p className="text-[10px] text-foreground-500 mt-0.5 pl-5 truncate">
                  {agents.find((a) => a.did === step.agentId)?.name ??
                    step.agentId.slice(0, 20)}
                </p>
              )}
              {step.error && (
                <p className="text-[10px] text-danger-600 mt-1 pl-5 font-mono leading-snug break-all">
                  ✗ {step.error.slice(0, 120)}
                  {step.error.length > 120 ? "…" : ""}
                </p>
              )}
              {step.output && step.status !== "pending" && (
                <pre className="text-[9px] text-foreground-600 mt-1 pl-5 leading-snug overflow-hidden max-h-10 font-mono">
                  {JSON.stringify(step.output).slice(0, 150)}
                </pre>
              )}
            </div>
          ))
        ) : (
          <p className="text-[11px] text-foreground-600 py-2">
            No step data available.
          </p>
        )}
      </div>
      <div className="px-5 pb-4 pt-2 border-t border-neutral-200/40 flex items-center justify-between shrink-0">
        <span className="text-[10px] text-foreground-500 font-mono">
          {run.id.slice(0, 8)}…
        </span>
        <button
          onClick={() => {
            onClose();
            router.push(`/app/workflows/${run.workflowId}`);
          }}
          className="flex items-center gap-1.5 text-[11px] text-primary-600 hover:text-primary-700 font-medium transition-colors"
        >
          View workflow <ArrowUpRight size={11} />
        </button>
      </div>
    </>
  );
}

function IntentDetail({
  intent,
  agents,
  onClose,
}: {
  intent: Intent | undefined;
  agents: AgentInfo[];
  onClose: () => void;
}) {
  const router = useRouter();
  if (!intent)
    return <p className="p-6 text-foreground-600 text-sm">Intent not found.</p>;

  const name = agentLabel(intent.agentDid, (did) =>
    agents.find((a) => a.did === did)?.name
  );
  const statusColor = STATUS_COLOR[intent.status] ?? "text-foreground-600";
  const paramsStr = intent.params
    ? JSON.stringify(intent.params, null, 2)
    : null;
  const outputStr = intent.output
    ? JSON.stringify(intent.output, null, 2)
    : null;

  return (
    <>
      <div className="px-5 pt-5 pb-3 border-b border-neutral-200/40 pr-10 shrink-0">
        <p className="text-sm font-bold text-foreground truncate">
          {intent.action}
        </p>
        <div className="flex items-center gap-3 mt-1 text-[10px]">
          <span className={`font-semibold ${statusColor}`}>
            {intent.status}
          </span>
          <span className="text-foreground-500">{timeAgo(intent.sentAt)}</span>
          {intent.completedAt && (
            <span className="text-foreground-600">
              {durationBetween(intent.sentAt, intent.completedAt)}
            </span>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3 min-h-0 text-[11px]">
        <Row icon={<Bot size={11} />} label="Agent">
          <span className="text-foreground">{name}</span>
        </Row>
        <Row icon={<ArrowUpRight size={11} />} label="Intent ID">
          <span className="font-mono text-foreground-600">
            {intent.intentId.slice(0, 16)}…
          </span>
        </Row>
        {paramsStr && (
          <div>
            <p className="text-[10px] text-foreground-500 mb-1 font-semibold">
              Params
            </p>
            <pre className="text-[10px] font-mono bg-background-200 rounded-lg p-2.5 overflow-auto max-h-24 text-foreground-600 leading-snug">
              {paramsStr.slice(0, 400)}
              {paramsStr.length > 400 ? "\n…" : ""}
            </pre>
          </div>
        )}
        {intent.error && (
          <div>
            <p className="text-[10px] text-danger-600 mb-1 font-semibold">
              Error
            </p>
            <pre className="text-[10px] font-mono bg-danger-500/5 border border-danger-500/30 rounded-lg p-2.5 overflow-auto max-h-20 text-danger-600 leading-snug">
              {intent.error.slice(0, 300)}
            </pre>
          </div>
        )}
        {outputStr && !intent.error && (
          <div>
            <p className="text-[10px] text-foreground-500 mb-1 font-semibold">
              Output
            </p>
            <pre className="text-[10px] font-mono bg-background-200 rounded-lg p-2.5 overflow-auto max-h-32 text-foreground-600 leading-snug">
              {outputStr.slice(0, 500)}
              {outputStr.length > 500 ? "\n…" : ""}
            </pre>
          </div>
        )}
      </div>
      <div className="px-5 pb-4 pt-2 border-t border-neutral-200/40 flex items-center justify-end shrink-0">
        <button
          onClick={() => {
            onClose();
            if (intent.agentDid)
              router.push(`/admin/agents/${encodeURIComponent(intent.agentDid)}`);
          }}
          disabled={!intent.agentDid}
          className="flex items-center gap-1.5 text-[11px] text-primary-600 hover:text-primary-700 font-medium transition-colors disabled:opacity-40"
        >
          View agent <ArrowUpRight size={11} />
        </button>
      </div>
    </>
  );
}

export function DetailModal({
  item,
  agents,
  workflowRuns,
  recentIntents,
  onClose,
}: {
  item: DetailItem;
  agents: AgentInfo[];
  workflowRuns: WorkflowRun[];
  recentIntents: Intent[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}
    >
      <div
        className="relative w-full max-w-md bg-background border border-neutral-200/60 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        style={{
          fontFamily: "'JetBrains Mono','Fira Code',ui-monospace,monospace",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-foreground-600 hover:text-foreground hover:bg-background-200 transition-colors z-10"
        >
          <X size={14} />
        </button>

        {item.type === "agent" && (
          <AgentDetail
            agent={agents.find((a) => a.did === item.id)}
            onClose={onClose}
          />
        )}
        {item.type === "workflow" && (
          <WorkflowDetail
            run={workflowRuns.find((r) => r.id === item.id)}
            agents={agents}
            onClose={onClose}
          />
        )}
        {item.type === "intent" && (
          <IntentDetail
            intent={recentIntents.find((i) => i.intentId === item.id)}
            agents={agents}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}
