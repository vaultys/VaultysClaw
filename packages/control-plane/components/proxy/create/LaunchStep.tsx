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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyButton } from "@/components/shared";
import { userApi, unwrap } from "@/lib/api/ts-rest/client";

interface LaunchStepProps {
  /** Proceed to the waiting step with the entered proxy name. */
  onContinue: (proxyName: string) => void;
}

export function LaunchStep({ onContinue }: LaunchStepProps) {
  const [connMethod, setConnMethod] = useState<"ws" | "peerjs">("ws");
  const [proxyName, setProxyName] = useState("");
  const [wsUrl, setWsUrl] = useState("");
  const [httpPort, setHttpPort] = useState("8090");

  // PeerJS connection info (fetched from the control plane)
  const [peerjsId, setPeerjsId] = useState<string | null>(null);
  const [peerjsEnabled, setPeerjsEnabled] = useState(false);
  const [peerjsServerUrl, setPeerjsServerUrl] = useState<string | null>(null);

  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    setWsUrl(`${proto}//${window.location.hostname}:8080`);

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

  const nameVal = proxyName.trim() || "<name>";
  const envLines =
    connMethod === "peerjs" && peerjsId
      ? [
          `VC_PROXY_NAME="${nameVal}"`,
          `VC_PEERJS_CONTROL_PLANE_ID="${peerjsId}"`,
          ...(peerjsServerUrl ? [`VC_PEERJS_SERVER_URL="${peerjsServerUrl}"`] : []),
          `PROXY_HTTP_PORT=${httpPort || "8090"}`,
        ]
      : [
          `VC_PROXY_NAME="${nameVal}"`,
          `VC_CONTROL_PLANE_WS_URL="${wsUrl}"`,
          `PROXY_HTTP_PORT=${httpPort || "8090"}`,
        ];
  const cliCommand = [...envLines.map((l) => `${l} \\`), "pnpm proxy:dev"].join("\n");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1">
          Launch a proxy
        </h2>
        <p className="text-sm text-foreground-500">
          A proxy runs the{" "}
          <code className="text-xs bg-background-200 border border-neutral-200 px-1 py-0.5 rounded">
            @vaultysclaw/proxy
          </code>{" "}
          package. It connects to this control plane exactly like an agent —
          own identity, register, wait for approval — then runs an HTTP
          listener that verifies and authorizes traffic locally.
        </p>
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
                className={connMethod === "ws" ? "text-primary-600" : "text-foreground-500"}
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
                className={connMethod === "peerjs" ? "text-secondary-600" : "text-foreground-500"}
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

      {/* Proxy name (required) */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground-500 uppercase tracking-wide">
          Proxy name <span className="text-danger-500">*</span>
        </label>
        <input
          value={proxyName}
          onChange={(e) => setProxyName(e.target.value)}
          placeholder="e.g. acme-crm-proxy"
          className={cn(
            "w-full px-3 py-2 bg-background-100 border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500",
            proxyName.trim() ? "border-neutral-200" : "border-warning-400"
          )}
        />
      </div>

      {/* HTTP listener port */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground-500 uppercase tracking-wide">
          HTTP listener port
        </label>
        <input
          value={httpPort}
          onChange={(e) => setHttpPort(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="8090"
          className="w-full px-3 py-2 bg-background-100 border border-neutral-200 rounded-lg text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <p className="text-xs text-foreground-400">
          The port callers point their API traffic at once the proxy is
          approved and configured.
        </p>
      </div>

      {/* Command */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-foreground-500 uppercase tracking-wide flex items-center gap-1.5">
            <Terminal size={12} /> Command
          </label>
          <CopyButton text={cliCommand} />
        </div>
        <pre className="bg-background border border-neutral-200 rounded-xl p-4 text-sm font-mono text-foreground-700 overflow-x-auto whitespace-pre-wrap leading-relaxed">
          {cliCommand}
        </pre>
        <p className="text-xs text-foreground-400">
          Run from the repo root (or wherever <code className="font-mono">@vaultysclaw/proxy</code>{" "}
          is installed).
        </p>
      </div>

      {/* How it works */}
      <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 text-sm space-y-2">
        <p className="font-medium text-primary-700 flex items-center gap-2">
          <Zap size={14} /> How it works
        </p>
        <ol className="list-decimal list-inside space-y-1 text-primary-700/80 text-xs">
          <li>The proxy starts, creates its own local identity, and connects to this control plane</li>
          <li>The control plane places it in a pending queue</li>
          <li>You approve it here — no capabilities to pick, just one click</li>
          <li>
            Configure its upstreams, rules, and principals from its detail page — the proxy
            picks up every change live
          </li>
        </ol>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => onContinue(proxyName.trim())}
          disabled={!proxyName.trim()}
          title={!proxyName.trim() ? "Enter a proxy name first" : undefined}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          I&apos;ve launched it — wait for connection <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
