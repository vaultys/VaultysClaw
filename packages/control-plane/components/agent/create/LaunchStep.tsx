"use client";

import { useEffect, useState } from "react";
import {
  Check,
  ChevronRight,
  Loader2,
  Terminal,
  Zap,
  Wifi,
  AlertTriangle,
  Radio,
  Bot,
  Plug,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyButton } from "@/components/shared";
import {
  userApi,
  unwrap,
} from "@/lib/api/ts-rest/client";
import { PKG_RUNNERS, MCP_PKG_RUNNERS, type PkgRunner, type AgentKind } from "./constants";
import { Workspace } from "@prisma/client";

interface LaunchStepProps {
  workspaces: Workspace[];
  /** Set the workspace the agent will be enrolled in during approval. */
  setSelectedWorkspaces: (s: Set<string>) => void;
  /** Proceed to the waiting step with the entered agent name. */
  onContinue: (agentName: string) => void;
  /** Preselect the MCP Gateway flow (e.g. deep-linked from Integrations). */
  initialKind?: AgentKind;
}

export function LaunchStep({
  workspaces,
  setSelectedWorkspaces,
  onContinue,
  initialKind = "cli",
}: LaunchStepProps) {
  const [kind, setKind] = useState<AgentKind>(initialKind);
  const [connMethod, setConnMethod] = useState<"ws" | "peerjs">("ws");
  const [agentName, setAgentName] = useState(
    initialKind === "mcp-gateway" ? "mcp-gateway" : ""
  );
  const [wsUrl, setWsUrl] = useState("");
  const [httpUrl, setHttpUrl] = useState("");
  const [pkgRunner, setPkgRunner] = useState<PkgRunner>("npx");
  const [selectedLaunchWorkspace, setSelectedLaunchWorkspace] = useState<string>("");

  // PeerJS connection info (fetched from the control plane)
  const [peerjsId, setPeerjsId] = useState<string | null>(null);
  const [peerjsEnabled, setPeerjsEnabled] = useState(false);
  const [peerjsServerUrl, setPeerjsServerUrl] = useState<string | null>(null);

  // Default the WS URL from the current origin + fetch PeerJS network info
  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    setWsUrl(`${proto}//${window.location.hostname}:8080`);
    setHttpUrl(`${window.location.protocol}//${window.location.hostname}:3000`);

    userApi.network
      .get({ query: {} })
      .then((res) => {
        const { peerjs } = unwrap(res);
        if (peerjs.peerId) setPeerjsId(peerjs.peerId);
        setPeerjsEnabled(peerjs.running);
        setPeerjsServerUrl(peerjs.serverUrl);
      })
      .catch(() => {});
  }, []);

  // Default the target workspace to the workspace marked default, once workspaces load
  useEffect(() => {
    if (selectedLaunchWorkspace) return;
    const def = workspaces.find((r) => r.isDefault);
    if (def) {
      setSelectedLaunchWorkspace(def.id);
      setSelectedWorkspaces(new Set([def.id]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaces]);

  const runners = kind === "mcp-gateway" ? MCP_PKG_RUNNERS : PKG_RUNNERS;
  const runnerPrefix = runners.find((r) => r.id === pkgRunner)!.prefix;
  const nameArg = agentName.trim();

  const cliCommand =
    kind === "mcp-gateway"
      ? [
          `VC_AGENT_NAME="${nameArg || "<required>"}"`,
          `VC_CONTROL_PLANE_URL=${httpUrl}`,
          ...(connMethod === "peerjs" && peerjsId
            ? [
                `VC_PEERJS_CONTROL_PLANE_ID=${peerjsId}`,
                ...(peerjsServerUrl ? [`VC_PEERJS_SERVER_URL=${peerjsServerUrl}`] : []),
              ]
            : [`VC_CONTROL_PLANE_WS_URL=${wsUrl}`]),
          runnerPrefix,
        ].join(" \\\n  ")
      : [
          runnerPrefix,
          nameArg ? `--name "${nameArg}"` : "--name <required>",
          ...(connMethod === "peerjs" && peerjsId
            ? [
                `--peerjs ${peerjsId}`,
                ...(peerjsServerUrl ? [`--peerjs-server ${peerjsServerUrl}`] : []),
              ]
            : [`--ws ${wsUrl}`]),
        ].join(" \\\n  ");

  const mcpClientConfig = JSON.stringify(
    {
      mcpServers: {
        vaultysclaw: {
          command: pkgRunner === "npx" ? "npx" : runners.find((r) => r.id === pkgRunner)!.prefix.split(" ")[0],
          args:
            pkgRunner === "npx"
              ? ["-y", "@vaultysclaw/mcp-gateway"]
              : runners.find((r) => r.id === pkgRunner)!.prefix.split(" ").slice(1),
          env: {
            VC_AGENT_NAME: nameArg || "mcp-gateway",
            VC_CONTROL_PLANE_URL: httpUrl,
            VC_CONTROL_PLANE_WS_URL: wsUrl,
          },
        },
      },
    },
    null,
    2
  );

  const workspaceNote = selectedLaunchWorkspace
    ? workspaces.find((r) => r.id === selectedLaunchWorkspace)?.name
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1">
          {kind === "mcp-gateway" ? "Connect an MCP client" : "Launch an agent"}
        </h2>
        <p className="text-sm text-foreground-500">
          {kind === "mcp-gateway" ? (
            <>
              The{" "}
              <code className="text-xs bg-background-200 border border-neutral-200 px-1 py-0.5 rounded">
                mcp-gateway
              </code>{" "}
              runs locally as an MCP server over stdio and connects to this
              control plane the same way an agent does. Once approved, your
              peer agents become callable tools inside Claude Code, Claude
              Desktop, or any other MCP client.
            </>
          ) : (
            <>
              An agent runs locally using the{" "}
              <code className="text-xs bg-background-200 border border-neutral-200 px-1 py-0.5 rounded">
                agent-controller
              </code>{" "}
              CLI. It connects to this control plane over WebSocket and waits
              for admin approval.
            </>
          )}
        </p>
      </div>

      {/* Agent kind selector */}
      <div className="space-y-3">
        <label className="text-xs font-medium text-foreground-500 uppercase tracking-wide">
          What are you connecting?
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setKind("cli")}
            className={`flex flex-col items-start gap-1.5 px-4 py-3 rounded-xl border text-left transition-colors ${
              kind === "cli"
                ? "bg-primary-50 border-primary-400"
                : "bg-background-100 border-neutral-200 hover:bg-background-200"
            }`}
          >
            <span className="flex items-center gap-2">
              <Bot
                size={15}
                className={kind === "cli" ? "text-primary-600" : "text-foreground-500"}
              />
              <span
                className={`text-sm font-medium ${kind === "cli" ? "text-primary-700" : "text-foreground"}`}
              >
                CLI agent
              </span>
              {kind === "cli" && <Check size={13} className="ml-auto text-primary-500" />}
            </span>
            <span className="text-xs text-foreground-500">
              A standalone agent-controller process
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setKind("mcp-gateway");
              if (!agentName.trim()) setAgentName("mcp-gateway");
            }}
            className={`flex flex-col items-start gap-1.5 px-4 py-3 rounded-xl border text-left transition-colors ${
              kind === "mcp-gateway"
                ? "bg-secondary-50 border-secondary-400"
                : "bg-background-100 border-neutral-200 hover:bg-background-200"
            }`}
          >
            <span className="flex items-center gap-2">
              <Plug
                size={15}
                className={kind === "mcp-gateway" ? "text-secondary-600" : "text-foreground-500"}
              />
              <span
                className={`text-sm font-medium ${kind === "mcp-gateway" ? "text-secondary-700" : "text-foreground"}`}
              >
                MCP Gateway
              </span>
              {kind === "mcp-gateway" && (
                <Check size={13} className="ml-auto text-secondary-500" />
              )}
            </span>
            <span className="text-xs text-foreground-500">
              Claude Code / Desktop, via MCP
            </span>
          </button>
        </div>
      </div>

      {/* Connection method selector */}
      <div className="space-y-3">
        <label className="text-xs font-medium text-foreground-500 uppercase tracking-wide">
          Connection method
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setConnMethod("ws")}
            className={`flex flex-col items-start gap-1.5 px-4 py-3 rounded-xl border text-left transition-colors ${
              connMethod === "ws"
                ? "bg-primary-50 border-primary-400"
                : "bg-background-100 border-neutral-200 hover:bg-background-200"
            }`}
          >
            <span className="flex items-center gap-2">
              <Wifi
                size={15}
                className={
                  connMethod === "ws"
                    ? "text-primary-600"
                    : "text-foreground-500"
                }
              />
              <span
                className={`text-sm font-medium ${connMethod === "ws" ? "text-primary-700" : "text-foreground"}`}
              >
                WebSocket
              </span>
              {connMethod === "ws" && (
                <Check size={13} className="ml-auto text-primary-500" />
              )}
            </span>
            <span className="text-xs text-foreground-500">
              Direct TCP, works everywhere. Default.
            </span>
          </button>
          <button
            type="button"
            onClick={() => setConnMethod("peerjs")}
            className={`flex flex-col items-start gap-1.5 px-4 py-3 rounded-xl border text-left transition-colors ${
              connMethod === "peerjs"
                ? "bg-secondary-50 border-secondary-400"
                : "bg-background-100 border-neutral-200 hover:bg-background-200"
            }`}
          >
            <span className="flex items-center gap-2">
              <Radio
                size={15}
                className={
                  connMethod === "peerjs"
                    ? "text-secondary-600"
                    : "text-foreground-500"
                }
              />
              <span
                className={`text-sm font-medium ${connMethod === "peerjs" ? "text-secondary-700" : "text-foreground"}`}
              >
                WebRTC / PeerJS
              </span>
              {connMethod === "peerjs" && (
                <Check size={13} className="ml-auto text-secondary-500" />
              )}
            </span>
            <span className="text-xs text-foreground-500">
              P2P via WebRTC — NAT-friendly, no port forwarding.
            </span>
          </button>
        </div>

        {/* WebSocket URL input */}
        {connMethod === "ws" && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground-500 uppercase tracking-wide">
              WebSocket URL
            </label>
            <input
              value={wsUrl}
              onChange={(e) => setWsUrl(e.target.value)}
              className="w-full px-3 py-2 bg-background-100 border border-neutral-200 rounded-lg text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        )}

        {/* PeerJS peer ID info */}
        {connMethod === "peerjs" && (
          <div className="space-y-2">
            {peerjsId ? (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground-500 uppercase tracking-wide">
                  Control plane peer ID
                </label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-background border border-neutral-200 rounded-lg text-xs font-mono text-foreground-700 break-all">
                    {peerjsId}
                  </code>
                  <CopyButton text={peerjsId} />
                </div>
                {!peerjsEnabled && (
                  <div className="flex items-center gap-2 bg-warning-50 border border-warning-300 rounded-lg px-3 py-2 text-xs text-warning-700">
                    <AlertTriangle size={12} className="shrink-0" />
                    PeerJS is not running.{" "}
                    <a href="/admin/network" className="underline underline-offset-2">
                      Start it from the Network page
                    </a>{" "}
                    first.
                  </div>
                )}
                {peerjsServerUrl && (
                  <p className="text-xs text-foreground-400">
                    Using custom signaling server:{" "}
                    <code className="font-mono">{peerjsServerUrl}</code>
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-background-200 border border-neutral-200 rounded-lg px-3 py-2 text-xs text-foreground-500">
                <Loader2 size={12} className="animate-spin shrink-0" />
                Loading peer ID…
              </div>
            )}
          </div>
        )}
      </div>

      {/* Agent name (required) */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground-500 uppercase tracking-wide">
          Agent name <span className="text-danger-500">*</span>
        </label>
        <input
          value={agentName}
          onChange={(e) => setAgentName(e.target.value)}
          placeholder={kind === "mcp-gateway" ? "mcp-gateway" : "e.g. researcher"}
          className={cn(
            "w-full px-3 py-2 bg-background-100 border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500",
            agentName.trim() ? "border-neutral-200" : "border-warning-400"
          )}
        />
        <p className="text-xs text-foreground-400">
          {kind === "mcp-gateway" ? (
            <>
              Identity is stored at{" "}
              <code className="font-mono bg-background-200 px-1 rounded">
                ~/.vaultysclaw/mcp-gateway.id
              </code>{" "}
              (override with <code className="font-mono bg-background-200 px-1 rounded">VC_VAULTYS_ID_PATH</code>)
            </>
          ) : (
            <>
              All agent data is stored in{" "}
              <code className="font-mono bg-background-200 px-1 rounded">
                .vaultys/{agentName.trim() || "<name>"}/
              </code>
            </>
          )}
        </p>
      </div>

      {/* Workspace selector */}
      {workspaces.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground-500 uppercase tracking-wide">
            Target workspace{" "}
            <span className="normal-case font-normal">
              (assigned during approval)
            </span>
          </label>
          <select
            value={selectedLaunchWorkspace}
            onChange={(e) => {
              setSelectedLaunchWorkspace(e.target.value);
              if (e.target.value) setSelectedWorkspaces(new Set([e.target.value]));
            }}
            className="w-full px-3 py-2 bg-background-100 border border-neutral-200 rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">No preference</option>
            {workspaces.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.isDefault ? " (default)" : ""}
              </option>
            ))}
          </select>
          {workspaceNote && (
            <p className="text-xs text-foreground-400">
              The agent will be enrolled in <strong>{workspaceNote}</strong> during
              the approval step.
            </p>
          )}
        </div>
      )}

      {/* Package runner selector + CLI command */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-foreground-500 uppercase tracking-wide flex items-center gap-1.5">
            <Terminal size={12} /> {kind === "mcp-gateway" ? "Run manually" : "CLI command"}
          </label>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-neutral-200 overflow-hidden text-xs">
              {runners.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setPkgRunner(r.id)}
                  className={cn(
                    "px-2.5 py-1 font-mono transition-colors",
                    pkgRunner === r.id
                      ? "bg-primary-600 text-white"
                      : "bg-background-100 text-foreground-500 hover:bg-background-200"
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <CopyButton text={cliCommand} />
          </div>
        </div>
        <pre className="bg-background border border-neutral-200 rounded-xl p-4 text-sm font-mono text-foreground-700 overflow-x-auto whitespace-pre-wrap leading-relaxed">
          {cliCommand}
        </pre>
      </div>

      {/* MCP client config — how to point Claude Code/Desktop at it directly */}
      {kind === "mcp-gateway" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-foreground-500 uppercase tracking-wide flex items-center gap-1.5">
              <Plug size={12} /> MCP client config
            </label>
            <CopyButton text={mcpClientConfig} />
          </div>
          <pre className="bg-background border border-neutral-200 rounded-xl p-4 text-xs font-mono text-foreground-700 overflow-x-auto whitespace-pre leading-relaxed">
            {mcpClientConfig}
          </pre>
          <p className="text-xs text-foreground-400">
            Drop this into Claude Desktop&apos;s config (or your MCP
            client&apos;s equivalent) so it launches the gateway for you — no
            manual command needed.
          </p>
        </div>
      )}

      {/* How it works */}
      <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 text-sm space-y-2">
        <p className="font-medium text-primary-700 flex items-center gap-2">
          <Zap size={14} /> How it works
        </p>
        <ol className="list-decimal list-inside space-y-1 text-primary-700/80 text-xs">
          {connMethod === "peerjs" ? (
            <>
              <li>
                The {kind === "mcp-gateway" ? "gateway" : "CLI"} starts, creates a
                local identity, and connects via WebRTC using the peer ID above
              </li>
              <li>
                A PeerJS signaling server brokers the connection — no port
                forwarding required
              </li>
              <li>
                The control plane receives the connection and places it in a
                pending queue
              </li>
              <li>You approve it here — assigning capabilities and a workspace</li>
              <li>
                {kind === "mcp-gateway"
                  ? "Peer agents become callable tools in your MCP client"
                  : "The agent becomes active and starts accepting instructions"}
              </li>
            </>
          ) : (
            <>
              <li>
                The {kind === "mcp-gateway" ? "gateway" : "CLI"} starts, creates a
                local identity, and connects via WebSocket
              </li>
              <li>
                The control plane receives the connection and places it in a
                pending queue
              </li>
              <li>You approve it here — assigning capabilities and a workspace</li>
              <li>
                {kind === "mcp-gateway"
                  ? "Peer agents become callable tools in your MCP client"
                  : "The agent becomes active and starts accepting instructions"}
              </li>
            </>
          )}
        </ol>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => onContinue(agentName.trim())}
          disabled={!agentName.trim()}
          title={!agentName.trim() ? "Enter an agent name first" : undefined}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          I&apos;ve launched it — wait for connection <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
