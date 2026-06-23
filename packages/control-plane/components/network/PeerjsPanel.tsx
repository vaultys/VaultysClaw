import { useState } from "react";
import {
  Radio,
  Play,
  Square,
  Loader2,
  Settings2,
  X,
  Link2,
  HelpCircle,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@vaultysclaw/shared";
import type { PeerjsState } from "@/lib/contracts";
import { CopyButton } from "./CopyButton";
import { PeerjsSetupGuide } from "./PeerjsSetupGuide";

export type PeerjsControlAction = "start" | "stop" | "restart-peerjs";

export function PeerjsPanel({
  data,
  onAction,
}: {
  data: PeerjsState;
  onAction: (
    action: PeerjsControlAction,
    serverUrl?: string | null
  ) => Promise<void>;
}) {
  const [acting, setActing] = useState(false);
  const [actingAction, setActingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [serverUrl, setServerUrl] = useState(data.serverUrl ?? "");

  async function handle(action: PeerjsControlAction) {
    setActing(true);
    setActingAction(action);
    setError(null);
    try {
      await onAction(
        action,
        action === "start" ? serverUrl.trim() || null : undefined
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setActing(false);
      setActingAction(null);
    }
  }

  return (
    <>
      {/* Help Modal */}
      {showHelpModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setShowHelpModal(false)}
        >
          <div
            className="relative bg-background-100 border border-neutral-200 rounded-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowHelpModal(false)}
              className="absolute top-3 right-3 p-1.5 rounded hover:bg-background-200 transition-colors text-foreground-500 z-10"
            >
              <X size={16} />
            </button>
            <div className="p-5">
              <PeerjsSetupGuide configuredUrl={data.serverUrl} />
            </div>
          </div>
        </div>
      )}

      <div
        className={cn(
          "rounded-xl border p-5 space-y-4",
          data.running
            ? "bg-secondary-50/60 border-secondary-300"
            : "bg-background-100 border-neutral-200"
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "w-9 h-9 rounded-lg flex items-center justify-center border",
              data.running
                ? "bg-secondary-100 border-secondary-300"
                : "bg-background-200 border-neutral-200"
            )}
          >
            <Radio
              size={18}
              className={
                data.running ? "text-secondary-600" : "text-foreground-500"
              }
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">
                WebRTC / PeerJS
              </span>
              <span
                className={cn(
                  "text-[10px] font-medium px-2 py-0.5 rounded-full border",
                  data.running
                    ? "bg-secondary-100 text-secondary-700 border-secondary-300"
                    : "bg-background-200 text-foreground-500 border-neutral-200"
                )}
              >
                {data.running ? "Running" : "Stopped"}
              </span>
            </div>
            {data.running && data.startedAt && (
              <p className="text-xs text-foreground-500 mt-0.5">
                Started {timeAgo(data.startedAt)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowConfig((v) => !v)}
              className="p-1.5 rounded hover:bg-background-200 transition-colors text-foreground-500"
              title="Configure"
            >
              <Settings2 size={15} />
            </button>
            <button
              onClick={() => setShowHelpModal(true)}
              className="p-1.5 rounded hover:bg-background-200 transition-colors text-foreground-500"
              title="Setup guide"
            >
              <HelpCircle size={15} />
            </button>
            {data.running ? (
              <>
                <button
                  onClick={() => handle("restart-peerjs")}
                  disabled={acting}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-background-200 border border-neutral-200 text-warning-600 hover:border-warning-400 hover:text-warning-700 disabled:opacity-50 transition-colors"
                >
                  {acting && actingAction === "restart-peerjs" ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <RotateCcw size={12} />
                  )}
                  Restart
                </button>
                <button
                  onClick={() => handle("stop")}
                  disabled={acting}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-danger-100 text-danger-700 border border-danger-300 hover:bg-danger-200 disabled:opacity-50 transition-colors"
                >
                  {acting && actingAction === "stop" ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Square size={12} />
                  )}
                  Stop
                </button>
              </>
            ) : (
              <button
                onClick={() => handle("start")}
                disabled={acting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-secondary-600 hover:bg-secondary-500 text-white disabled:opacity-50 transition-colors"
              >
                {acting ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Play size={12} />
                )}
                Start
              </button>
            )}
          </div>
        </div>

        {/* Config panel */}
        {showConfig && (
          <div className="bg-background border border-neutral-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground-500 uppercase tracking-wide">
                Configuration
              </span>
              <button
                onClick={() => setShowConfig(false)}
                className="text-foreground-500 hover:text-foreground"
              >
                <X size={14} />
              </button>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-foreground-500">
                Signaling server URL{" "}
                <span className="text-foreground-400">
                  (leave blank for public relay)
                </span>
              </label>
              <input
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="https://my.peerserver.example"
                className="w-full px-3 py-2 bg-background-100 border border-neutral-200 rounded-lg text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-secondary-500"
              />
            </div>
            {!data.running && (
              <p className="text-xs text-foreground-400">
                URL is applied when you click Start.
              </p>
            )}
            {data.running && (
              <p className="text-xs text-warning-600">
                Stop and restart to apply a new URL.
              </p>
            )}
          </div>
        )}

        {/* Peer ID */}
        {data.peerId && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground-500 uppercase tracking-wide flex items-center gap-1.5">
              <Link2 size={11} /> Peer ID
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono text-foreground bg-background border border-neutral-200 rounded-lg px-3 py-2 break-all">
                {data.peerId}
              </code>
              <CopyButton text={data.peerId} />
            </div>
            <p className="text-xs text-foreground-400">
              Agents connect with:{" "}
              <code className="font-mono text-foreground-500">
                --peerjs {data.peerId}
              </code>
              {data.serverUrl && (
                <>
                  {" "}
                  <code className="font-mono text-foreground-500">
                    --peerjs-server {data.serverUrl}
                  </code>
                </>
              )}
            </p>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 bg-danger-50 border border-danger-300 rounded-lg px-3 py-2 text-xs text-danger-600">
            <AlertTriangle size={12} className="shrink-0" />
            {error}
          </div>
        )}
      </div>
    </>
  );
}
