"use client";

import { useState, useEffect } from "react";
import { Activity, Loader2, Edit2, CheckCircle, AlertCircle } from "lucide-react";
import {
  Field,
  StatusBadge,
  IntegrationPanel,
  IntegrationHeader,
  IntegrationModal,
} from "./shared";
import { settingsClient, unwrap } from "@/lib/api/ts-rest/client";
import type { OtelConfig, OtelTestResult } from "@/lib/contracts";

export function OpenTelemetryPanel() {
  const [status, setStatus] = useState<OtelConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [serviceName, setServiceName] = useState("vaultysclaw-control-plane");
  const [isSaving, setIsSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<OtelTestResult | null>(null);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      const data = unwrap(await settingsClient.getOtel());
      setStatus(data);
      setEnabled(data.enabled);
      setBaseUrl(data.baseUrl || "");
      setServiceName(data.serviceName || "vaultysclaw-control-plane");

      // Auto-test on mount if configured
      if (data.enabled && data.baseUrl) {
        testConnection(data.baseUrl, data);
      }
    } catch {
      setStatus({
        enabled: false,
        baseUrl: "",
        serviceName: "vaultysclaw-control-plane",
        connected: false,
        fromEnv: { enabled: false, baseUrl: false, serviceName: false },
      });
    } finally {
      setLoading(false);
    }
  };

  const testConnection = async (url?: string, currentStatus?: OtelConfig) => {
    const testUrl = url ?? baseUrl ?? status?.baseUrl;
    if (!testUrl) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = unwrap(
        await settingsClient.testOtel({ body: { baseUrl: testUrl } })
      );
      setTestResult(result);
      if (currentStatus) {
        setStatus({ ...currentStatus, connected: result.connected });
      } else if (status) {
        setStatus({ ...status, connected: result.connected });
      }
    } catch {
      setTestResult({ connected: false, error: "Network error" });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      unwrap(
        await settingsClient.saveOtel({
          body: { enabled, baseUrl, serviceName },
        })
      );
      setIsModalOpen(false);
      await loadStatus();
    } catch {
      // error handled by user feedback
    } finally {
      setIsSaving(false);
    }
  };

  const badgeStatus: "success" | "warning" | "idle" = status?.enabled
    ? status.connected ? "success" : "warning"
    : "idle";
  const badgeLabel = status?.enabled
    ? status.connected ? "Connected" : "Configured"
    : "Disabled";

  return (
    <>
      <IntegrationPanel>
        <IntegrationHeader
          icon={Activity}
          title="OpenTelemetry"
          description="Distributed tracing & observability"
        />
        <div className="p-5 space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-foreground-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Status</p>
                    <p className="text-xs text-foreground-400">
                      {status?.enabled ? `OTLP: ${status.baseUrl || "—"}` : "Disabled"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {testing && <Loader2 className="w-3.5 h-3.5 text-foreground-400 animate-spin" />}
                    <StatusBadge status={badgeStatus} message={badgeLabel} />
                  </div>
                </div>

                {testResult && (
                  <div className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${testResult.connected ? "bg-success-50 border border-success-200 text-success-700" : "bg-danger-50 border border-danger-200 text-danger-700"}`}>
                    {testResult.connected
                      ? <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      : <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                    {testResult.connected
                      ? `OTLP reachable${testResult.latency ? ` (${testResult.latency}ms)` : ""}`
                      : (testResult.error ?? `HTTP ${testResult.statusCode ?? "error"}`)}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="flex-1 px-4 py-2 text-xs font-medium rounded-lg bg-background-200 border border-neutral-300 hover:border-foreground-500 text-foreground transition flex items-center justify-center gap-1.5"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  Configure
                </button>
                {status?.enabled && status?.baseUrl && (
                  <button
                    onClick={() => testConnection()}
                    disabled={testing}
                    className="px-4 py-2 text-xs font-medium rounded-lg bg-background-200 border border-neutral-300 hover:border-foreground-500 text-foreground disabled:opacity-40 transition flex items-center gap-1.5"
                  >
                    {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
                    Test
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </IntegrationPanel>

      <IntegrationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Configure OpenTelemetry"
        onSave={handleSave}
        isSaving={isSaving}
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="otel-enabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="otel-enabled" className="text-sm font-medium text-foreground">
              Enable OpenTelemetry
            </label>
          </div>
          {enabled && (
            <>
              <Field
                label="OTLP Endpoint"
                id="otel-endpoint"
                value={baseUrl}
                onChange={setBaseUrl}
                placeholder="http://localhost:4318"
              />
              {status?.fromEnv?.baseUrl && !baseUrl && (
                <p className="text-xs text-warning-600">
                  Currently using <code>OTEL_EXPORTER_OTLP_ENDPOINT</code> env var. Save a value here to override it.
                </p>
              )}
              <Field
                label="Service Name"
                id="otel-service"
                value={serviceName}
                onChange={setServiceName}
                placeholder="vaultysclaw-control-plane"
              />
              {status?.fromEnv?.serviceName && !serviceName && (
                <p className="text-xs text-warning-600">
                  Currently using <code>OTEL_SERVICE_NAME</code> env var.
                </p>
              )}
              <p className="text-xs text-foreground-400">
                OTLP/HTTP protocol. Port 4318 is standard for OTLP/HTTP.
              </p>
            </>
          )}
        </div>
      </IntegrationModal>
    </>
  );
}
