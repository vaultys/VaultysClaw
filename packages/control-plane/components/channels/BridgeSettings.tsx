"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Copy,
  RefreshCw,
} from "lucide-react";
import {
  userApi,
  unwrap,
} from "@/lib/api/ts-rest/client";
import type { ChannelBridgePublic } from "@/lib/contracts";

type BridgeRecord = ChannelBridgePublic;

interface BridgeSettingsProps {
  channelId: string;
  onClose: () => void;
}

type ServiceType = "teams" | "webhook";
type Direction = "incoming" | "outgoing" | "bidirectional";

function generateSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function DirectionBadge({ direction }: { direction: Direction }) {
  const colors: Record<Direction, string> = {
    incoming: "bg-primary-500/20 text-primary-400",
    outgoing: "bg-success-500/20 text-success-400",
    bidirectional: "bg-secondary-500/20 text-secondary-400",
  };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[direction]}`}
    >
      {direction}
    </span>
  );
}

export default function BridgeSettings({
  channelId,
  onClose,
}: BridgeSettingsProps) {
  const [bridges, setBridges] = useState<BridgeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [service, setService] = useState<ServiceType>("webhook");
  const [externalChannelId, setExternalChannelId] = useState("");
  const [externalChannelName, setExternalChannelName] = useState("");
  const [externalWorkspaceId, setExternalWorkspaceId] = useState("");
  const [direction, setDirection] = useState<Direction>("bidirectional");

  // Webhook-specific
  const [outgoingUrl, setOutgoingUrl] = useState("");
  const [secret, setSecret] = useState("");

  // Teams-specific
  const [tenantId, setTenantId] = useState("");
  const [botId, setBotId] = useState("");
  const [accessToken, setAccessToken] = useState("");

  const fetchBridges = useCallback(async () => {
    try {
      setLoading(true);
      const { bridges } = unwrap(
        await userApi.channels.listBridges({ params: { id: channelId } })
      );
      setBridges(bridges);
    } catch (err) {
      console.error("Failed to fetch bridges:", err);
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    void fetchBridges();
  }, [fetchBridges]);

  const resetForm = () => {
    setService("webhook");
    setExternalChannelId("");
    setExternalChannelName("");
    setExternalWorkspaceId("");
    setDirection("bidirectional");
    setOutgoingUrl("");
    setSecret("");
    setTenantId("");
    setBotId("");
    setAccessToken("");
    setError(null);
  };

  const handleAddBridge = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const config =
      service === "webhook"
        ? { webhookUrl: "", outgoingUrl, secret }
        : { accessToken, tenantId, botId };

    try {
      unwrap(
        await userApi.channels.createBridge({
          params: { id: channelId },
          body: {
            externalService: service,
            externalChannelId,
            externalChannelName,
            externalWorkspaceId,
            syncDirection: direction,
            config,
          },
        })
      );

      await fetchBridges();
      resetForm();
      setShowAddForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create bridge");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (bridge: BridgeRecord) => {
    try {
      unwrap(
        await userApi.channels.updateBridge({
          params: { id: channelId, bridgeId: bridge.id },
          body: { isSyncEnabled: !bridge.isSyncEnabled },
        })
      );
      await fetchBridges();
    } catch (err) {
      console.error("Toggle failed:", err);
    }
  };

  const handleDelete = async (bridgeId: string) => {
    if (!confirm("Delete this bridge? External messages will no longer sync."))
      return;
    try {
      await userApi.channels.deleteBridge({
        params: { id: channelId, bridgeId },
      });
      await fetchBridges();
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const incomingWebhookUrl = (bridgeId: string) =>
    typeof window !== "undefined"
      ? `${window.location.origin}/api/public/bridges/webhook/${bridgeId}/incoming`
      : `/api/public/bridges/webhook/${bridgeId}/incoming`;

  return (
    <div className="w-80 border-l border-neutral-200 bg-background-200 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
        <h3 className="font-semibold text-foreground text-sm">Bridges</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setShowAddForm((v) => !v);
              setError(null);
            }}
            className="p-1.5 hover:bg-background-100 rounded transition text-foreground-700"
            title="Add bridge"
          >
            <Plus size={16} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-background-100 rounded transition text-foreground-700"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Add bridge form */}
        {showAddForm && (
          <form
            onSubmit={(e) => {
              void handleAddBridge(e);
            }}
            className="p-4 border-b border-neutral-200 space-y-3"
          >
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Add Bridge
            </h4>

            {error && (
              <p className="text-xs text-danger-400 bg-danger-500/10 px-3 py-2 rounded">
                {error}
              </p>
            )}

            {/* Service select */}
            <div>
              <label className="block text-xs text-foreground-500 mb-1">
                Service
              </label>
              <select
                value={service}
                onChange={(e) => setService(e.target.value as ServiceType)}
                className="w-full bg-background border border-neutral-200 rounded px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary-500"
              >
                <option value="webhook">Webhook</option>
                <option value="teams">Microsoft Teams</option>
              </select>
            </div>

            {/* Common fields */}
            <div>
              <label className="block text-xs text-foreground-500 mb-1">
                External channel ID
              </label>
              <input
                required
                value={externalChannelId}
                onChange={(e) => setExternalChannelId(e.target.value)}
                placeholder="e.g. C01234ABCD"
                className="w-full bg-background border border-neutral-200 rounded px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary-500"
              />
            </div>

            <div>
              <label className="block text-xs text-foreground-500 mb-1">
                External channel name
              </label>
              <input
                required
                value={externalChannelName}
                onChange={(e) => setExternalChannelName(e.target.value)}
                placeholder="e.g. #general"
                className="w-full bg-background border border-neutral-200 rounded px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary-500"
              />
            </div>

            <div>
              <label className="block text-xs text-foreground-500 mb-1">
                Workspace / tenant ID
              </label>
              <input
                required
                value={externalWorkspaceId}
                onChange={(e) => setExternalWorkspaceId(e.target.value)}
                placeholder="e.g. workspace-id or tenant-id"
                className="w-full bg-background border border-neutral-200 rounded px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary-500"
              />
            </div>

            <div>
              <label className="block text-xs text-foreground-500 mb-1">
                Sync direction
              </label>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as Direction)}
                className="w-full bg-background border border-neutral-200 rounded px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary-500"
              >
                <option value="bidirectional">Bidirectional</option>
                <option value="incoming">Incoming only</option>
                <option value="outgoing">Outgoing only</option>
              </select>
            </div>

            {/* Webhook-specific fields */}
            {service === "webhook" && (
              <>
                <div>
                  <label className="block text-xs text-foreground-500 mb-1">
                    Outgoing URL
                  </label>
                  <input
                    required
                    type="url"
                    value={outgoingUrl}
                    onChange={(e) => setOutgoingUrl(e.target.value)}
                    placeholder="https://your-service.com/hook"
                    className="w-full bg-background border border-neutral-200 rounded px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-foreground-500 mb-1">
                    Secret
                  </label>
                  <div className="flex gap-1">
                    <input
                      required
                      value={secret}
                      onChange={(e) => setSecret(e.target.value)}
                      placeholder="HMAC secret"
                      className="flex-1 bg-background border border-neutral-200 rounded px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setSecret(generateSecret())}
                      className="p-1.5 hover:bg-background-100 rounded transition text-foreground-700 border border-neutral-200"
                      title="Generate secret"
                    >
                      <RefreshCw size={14} />
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Teams-specific fields */}
            {service === "teams" && (
              <>
                <div>
                  <label className="block text-xs text-foreground-500 mb-1">
                    Tenant ID
                  </label>
                  <input
                    required
                    value={tenantId}
                    onChange={(e) => setTenantId(e.target.value)}
                    placeholder="Azure AD tenant ID"
                    className="w-full bg-background border border-neutral-200 rounded px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-foreground-500 mb-1">
                    Bot / App ID
                  </label>
                  <input
                    required
                    value={botId}
                    onChange={(e) => setBotId(e.target.value)}
                    placeholder="Teams app/bot ID"
                    className="w-full bg-background border border-neutral-200 rounded px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-foreground-500 mb-1">
                    Access token
                  </label>
                  <input
                    required
                    type="password"
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder="Microsoft Graph access token"
                    className="w-full bg-background border border-neutral-200 rounded px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary-500 font-mono"
                  />
                </div>
              </>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-medium py-1.5 rounded transition"
              >
                {submitting ? "Creating..." : "Create bridge"}
              </button>
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setShowAddForm(false);
                }}
                className="flex-1 bg-background-100 hover:bg-background text-foreground text-sm font-medium py-1.5 rounded transition border border-neutral-200"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Bridge list */}
        <div className="p-3 space-y-2">
          {loading ? (
            <p className="text-xs text-foreground-500 text-center py-4">
              Loading bridges...
            </p>
          ) : bridges.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-foreground-500">
                No bridges configured.
              </p>
              <p className="text-xs text-foreground-500 mt-1">
                Add a bridge to sync with external services.
              </p>
            </div>
          ) : (
            bridges.map((bridge) => (
              <div
                key={bridge.id}
                className="bg-background-100 border border-neutral-200 rounded-lg p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {bridge.externalChannelName}
                    </p>
                    <p className="text-xs text-foreground-500 capitalize mt-0.5">
                      {bridge.externalService}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => void handleToggle(bridge)}
                      className="text-foreground-700 hover:text-foreground transition"
                      title={
                        bridge.isSyncEnabled ? "Disable sync" : "Enable sync"
                      }
                    >
                      {bridge.isSyncEnabled ? (
                        <ToggleRight size={18} className="text-success-400" />
                      ) : (
                        <ToggleLeft size={18} />
                      )}
                    </button>
                    <button
                      onClick={() => void handleDelete(bridge.id)}
                      className="text-foreground-700 hover:text-danger-400 transition"
                      title="Delete bridge"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <DirectionBadge direction={bridge.syncDirection} />

                {/* Incoming webhook URL for webhook bridges */}
                {bridge.externalService === "webhook" &&
                  bridge.syncDirection !== "outgoing" && (
                    <div className="mt-2">
                      <p className="text-xs text-foreground-500 mb-1">
                        Incoming URL
                      </p>
                      <div className="flex items-center gap-1">
                        <code className="flex-1 text-xs bg-background border border-neutral-200 rounded px-2 py-1 text-foreground-700 truncate font-mono">
                          {incomingWebhookUrl(bridge.id)}
                        </code>
                        <button
                          onClick={() =>
                            copyToClipboard(incomingWebhookUrl(bridge.id))
                          }
                          className="shrink-0 p-1 hover:bg-background rounded transition text-foreground-700"
                          title="Copy URL"
                        >
                          <Copy size={12} />
                        </button>
                      </div>
                    </div>
                  )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
