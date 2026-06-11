"use client";

import { useState, useEffect } from "react";
import { FileText, Loader2, Edit2, Send } from "lucide-react";
import {
  Field,
  StatusBadge,
  IntegrationPanel,
  IntegrationHeader,
  IntegrationModal,
} from "./shared";

interface DoclingStatus {
  enabled: boolean;
  url: string;
  connected?: boolean;
}

export function DoclingPanel() {
  const [status, setStatus] = useState<DoclingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      const r = await fetch("/api/settings/docling");
      const data = (await r.json()) as DoclingStatus;
      setStatus(data);
      setUrl(data.url || "");
      setEnabled(data.enabled);
    } catch {
      setStatus({ enabled: false, url: "" });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const r = await fetch("/api/settings/docling", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, enabled }),
      });
      if (r.ok) {
        setIsModalOpen(false);
        await loadStatus();
      }
    } catch {
      // error handled
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const r = await fetch("/api/settings/docling/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await r.json()) as { ok?: boolean; version?: string; error?: string };
      setTestResult(data.ok ? `✓ Connected (v${data.version || "unknown"})` : `✗ ${data.error || "Connection failed"}`);
    } catch (e) {
      setTestResult(`✗ ${e instanceof Error ? e.message : "Connection failed"}`);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <>
      <IntegrationPanel>
        <IntegrationHeader
          icon={FileText}
          title="Docling"
          description="Document processing service"
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
                    <p className="text-xs text-foreground-400">{status?.url || "Not configured"}</p>
                  </div>
                  <StatusBadge
                    status={status?.enabled ? "success" : "warning"}
                    message={status?.enabled ? "Enabled" : "Disabled"}
                  />
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(true)}
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
        onClose={() => setIsModalOpen(false)}
        title="Configure Docling"
        onSave={handleSave}
        isSaving={isSaving}
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="docling-enabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="docling-enabled" className="text-sm font-medium text-foreground">
              Enable Docling
            </label>
          </div>

          {enabled && (
            <>
              <Field
                label="Docling Service URL"
                id="docling-url"
                value={url}
                onChange={setUrl}
                placeholder="http://localhost:5001"
              />
              <button
                type="button"
                onClick={handleTest}
                disabled={isTesting || !url}
                className="w-full px-4 py-2 text-xs font-medium rounded-lg bg-background-200 border border-neutral-300 hover:border-foreground-500 text-foreground disabled:opacity-40 transition flex items-center justify-center gap-1.5"
              >
                {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Test Connection
              </button>
              {testResult && (
                <p className={`text-xs ${testResult.startsWith("✓") ? "text-success-600" : "text-danger-600"}`}>
                  {testResult}
                </p>
              )}
            </>
          )}
        </div>
      </IntegrationModal>
    </>
  );
}
