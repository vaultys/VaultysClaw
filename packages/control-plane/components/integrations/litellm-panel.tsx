"use client";

import { useState, useEffect } from "react";
import { Zap, Loader2, Edit2 } from "lucide-react";
import {
  Field,
  StatusBadge,
  IntegrationPanel,
  IntegrationHeader,
  IntegrationModal,
} from "./shared";
import {
  adminApi,
  unwrap,
} from "@/lib/api/ts-rest/client";
import type { LiteLLMStatus } from "@/lib/contracts";

export function LiteLLMPanel() {
  const [status, setStatus] = useState<LiteLLMStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [masterKey, setMasterKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      const data = unwrap(await adminApi.settings.getLitellm());

      // Service is configured in DB/env but the in-memory state hasn't connected yet
      // (e.g. first load after server restart). Trigger a reconnect automatically.
      if (data.configured && data.status === "unconfigured") {
        setStatus({ ...data, status: "connecting" });
        setBaseUrl(data.baseUrl ?? "");
        setLoading(false);
        setReconnecting(true);
        try {
          await adminApi.settings.reconnectLitellm();
        } catch { /* ignore */ }
        setReconnecting(false);
        // Reload to get the real post-reconnect state
        const data2 = unwrap(await adminApi.settings.getLitellm());
        setStatus(data2);
        setBaseUrl(data2.baseUrl ?? "");
        return;
      }

      setStatus(data);
      setBaseUrl(data.baseUrl ?? "");
    } catch {
      setStatus({
        configured: false, healthy: false, status: "unconfigured",
        baseUrl: null, masterKeySet: false, source: "db",
        lastError: null, checkedAt: null,
        stats: { modelCount: 0, totalSpend: null, keyCount: null },
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      unwrap(
        await adminApi.settings.saveLitellm({
          body: { baseUrl, masterKey: masterKey || null },
        })
      );
      setIsModalOpen(false);
      setMasterKey("");
      await loadStatus();
    } catch {
      // error handled by user feedback
    } finally {
      setIsSaving(false);
    }
  };

  const badgeStatus =
    status?.status === "connected" ? "success"
    : status?.status === "error" ? "error"
    : "warning";

  const badgeLabel =
    status?.status === "connected" ? "Connected"
    : status?.status === "error" ? "Error"
    : status?.status === "connecting" ? "Connecting…"
    : "Unconfigured";

  return (
    <>
      <IntegrationPanel>
        <IntegrationHeader
          icon={Zap}
          title="LiteLLM"
          description="AI model proxy service"
        />
        <div className="p-5 space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-foreground-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : reconnecting ? (
            <div className="flex items-center gap-2 text-foreground-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Checking connection…
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Status</p>
                    <p className="text-xs text-foreground-400">
                      {status?.baseUrl ?? "Not configured"}
                      {status?.source === "env" && (
                        <span className="ml-1 text-warning-600">(from env)</span>
                      )}
                    </p>
                  </div>
                  <StatusBadge status={badgeStatus} message={badgeLabel} />
                </div>

                {status?.configured && (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      { label: "Models", value: status.stats?.modelCount ?? "—" },
                      { label: "Keys", value: status.stats?.keyCount ?? "—" },
                      { label: "Spend", value: status.stats?.totalSpend != null ? `$${status.stats.totalSpend.toFixed(2)}` : "—" },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-background-200 border border-neutral-300 rounded-lg px-2 py-2">
                        <p className="text-sm font-semibold text-foreground">{value}</p>
                        <p className="text-[10px] text-foreground-400 mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>
                )}

                {status?.lastError && status.status === "error" && (
                  <p className="text-xs text-danger-600 bg-danger-50 border border-danger-200 rounded-lg px-3 py-2">
                    {status.lastError}
                  </p>
                )}

                {status?.masterKeySet && (
                  <p className="text-xs text-foreground-500">Master key is set</p>
                )}
              </div>

              <button
                onClick={() => {
                  setBaseUrl(status?.baseUrl ?? "");
                  setIsModalOpen(true);
                }}
                className="w-full px-4 py-2 text-xs font-medium rounded-lg bg-background-200 border border-neutral-300 hover:border-foreground-500 text-foreground transition flex items-center justify-center gap-1.5"
              >
                <Edit2 className="w-3.5 h-3.5" />
                Configure
              </button>
            </>
          )}
        </div>
      </IntegrationPanel>

      <IntegrationModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setMasterKey(""); }}
        title="Configure LiteLLM"
        onSave={handleSave}
        isSaving={isSaving}
      >
        <div className="space-y-4">
          <Field
            label="LiteLLM Base URL"
            id="litellm-url"
            value={baseUrl}
            onChange={setBaseUrl}
            placeholder="http://localhost:4000"
          />
          {status?.source === "env" && (
            <p className="text-xs text-warning-600">
              URL is currently read from the <code>LITELLM_BASE_URL</code> env var. Save a value here to override it.
            </p>
          )}
          <Field
            label="Master Key (optional)"
            id="litellm-key"
            type="password"
            value={masterKey}
            onChange={setMasterKey}
            placeholder={status?.masterKeySet ? "Leave empty to keep current" : "sk-..."}
            showToggle
          />
        </div>
      </IntegrationModal>
    </>
  );
}
