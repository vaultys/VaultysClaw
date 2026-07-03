"use client";

import { useState, useEffect } from "react";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Cpu,
  Pencil,
  Save,
  Wifi,
  X,
  MapPin,
} from "lucide-react";
import dynamic from "next/dynamic";
import {
  adminApi,
  unwrap,
} from "@/lib/api/ts-rest/client";
import type { DoclingConfig, DoclingTestResult } from "@/lib/contracts";

const LocationEditor = dynamic(
  () => import("@/components/map/WorldMap").then((m) => m.LocationEditor),
  { ssr: false }
);

type DoclingState = Pick<DoclingConfig, "url" | "enabled" | "configured">;

type TestStatus = "idle" | "testing" | "ok" | "error";

export function DoclingConfigPanel() {
  const [cfg, setCfg] = useState<DoclingState>({
    url: "",
    enabled: false,
    configured: false,
  });
  const [editing, setEditing] = useState(false);
  const [draftUrl, setDraftUrl] = useState("");
  const [draftEnabled, setDraftEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testResult, setTestResult] = useState<DoclingTestResult | null>(null);
  const [locationEditing, setLocationEditing] = useState(false);
  const [location, setLocation] = useState<{
    lat: number;
    lon: number;
    label: string;
  } | null>(null);

  useEffect(() => {
    adminApi.settings
      .getDocling()
      .then((res) => {
        const d = unwrap(res);
        setCfg({ url: d.url, enabled: d.enabled, configured: d.configured });
        setDraftUrl(d.url ?? "");
        setDraftEnabled(d.enabled ?? false);
        if (d.locationLat != null && d.locationLon != null) {
          setLocation({
            lat: d.locationLat,
            lon: d.locationLon,
            label: d.locationLabel ?? "",
          });
        }
      })
      .catch(() => {});
  }, []);

  function startEdit() {
    setDraftUrl(cfg.url);
    setDraftEnabled(cfg.enabled);
    setTestStatus("idle");
    setTestResult(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setTestStatus("idle");
    setTestResult(null);
  }

  async function handleTest() {
    if (!draftUrl.trim()) return;
    setTestStatus("testing");
    setTestResult(null);
    try {
      const data = unwrap(
        await adminApi.settings.testDocling({ body: { url: draftUrl.trim() } })
      );
      setTestStatus(data.ok ? "ok" : "error");
      setTestResult(data);
    } catch (err) {
      setTestStatus("error");
      setTestResult({
        ok: false,
        error: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  async function handleSaveDoclingLocation(
    loc: { lat: number; lon: number; label: string } | null
  ) {
    const body =
      loc === null
        ? { lat: null }
        : { lat: loc.lat, lon: loc.lon, label: loc.label };
    unwrap(await adminApi.settings.doclingLocation({ body }));
    setLocation(loc);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await adminApi.settings.updateDocling({
        body: { url: draftUrl.trim(), enabled: draftEnabled },
      });
      const next = {
        url: draftUrl.trim(),
        enabled: draftEnabled,
        configured: !!draftUrl.trim(),
      };
      setCfg(next);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  const connectionPill = (() => {
    if (!cfg.configured)
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground-500 bg-background-200 border border-neutral-300 rounded-full px-2.5 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
          Not configured
        </span>
      );
    if (!cfg.enabled)
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warning-700 bg-warning-100 border border-warning-300 rounded-full px-2.5 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-warning-500" />
          Disabled
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success-700 bg-success-100 border border-success-300 rounded-full px-2.5 py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-success-500" />
        Active
      </span>
    );
  })();

  return (
    <div
      className={`rounded-xl border bg-background-100 overflow-hidden transition-colors ${
        cfg.enabled ? "border-primary-300" : "border-neutral-200"
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            cfg.enabled ? "bg-primary-100" : "bg-neutral-100"
          }`}
        >
          <Cpu
            className={`w-4 h-4 ${cfg.enabled ? "text-primary-600" : "text-foreground-500"}`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              Docling
            </span>
            {connectionPill}
          </div>
          <p className="text-xs text-foreground-500 mt-0.5">
            Document parser — converts PDFs, DOCX &amp; HTML to structured
            Markdown before chunking
          </p>
        </div>
        {!editing && (
          <button
            onClick={startEdit}
            className="flex items-center gap-1.5 text-xs text-foreground-500 hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-background-200"
          >
            <Pencil size={13} />
            Configure
          </button>
        )}
      </div>

      {/* Collapsed summary */}
      {!editing && cfg.configured && (
        <div className="px-4 pb-3 flex items-center gap-3 text-xs text-foreground-500 border-t border-neutral-200/40 pt-2">
          <span className="font-mono text-foreground truncate">{cfg.url}</span>
          <span
            className={cfg.enabled ? "text-success-600" : "text-warning-600"}
          >
            {cfg.enabled ? "Enabled" : "Disabled"}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <MapPin size={11} className="shrink-0" />
            {location ? (
              <span className="truncate">
                {location.label ||
                  `${location.lat.toFixed(2)}, ${location.lon.toFixed(2)}`}
              </span>
            ) : (
              <span className="italic text-foreground-400">No location</span>
            )}
            <button
              onClick={() => setLocationEditing(true)}
              className="text-primary-500 hover:text-primary-400 ml-1"
            >
              {location ? "Edit" : "Set"}
            </button>
          </div>
        </div>
      )}
      {!editing && !cfg.configured && (
        <div className="px-4 pb-3 flex items-center gap-3 text-xs text-foreground-500 border-t border-neutral-200/40 pt-2">
          <div className="ml-auto flex items-center gap-1.5">
            <MapPin size={11} className="shrink-0" />
            {location ? (
              <span className="truncate">
                {location.label ||
                  `${location.lat.toFixed(2)}, ${location.lon.toFixed(2)}`}
              </span>
            ) : (
              <span className="italic text-foreground-400">No location</span>
            )}
            <button
              onClick={() => setLocationEditing(true)}
              className="text-primary-500 hover:text-primary-400 ml-1"
            >
              {location ? "Edit" : "Set"}
            </button>
          </div>
        </div>
      )}
      {locationEditing && (
        <LocationEditor
          current={location}
          onSave={handleSaveDoclingLocation}
          onClose={() => setLocationEditing(false)}
        />
      )}

      {/* Edit form */}
      {editing && (
        <div className="px-4 pb-4 border-t border-neutral-200/40 pt-3 space-y-3">
          {/* URL */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground-500 uppercase tracking-wider">
              Docling Serve URL
            </label>
            <div className="flex gap-2">
              <input
                value={draftUrl}
                onChange={(e) => {
                  setDraftUrl(e.target.value);
                  setTestStatus("idle");
                  setTestResult(null);
                }}
                placeholder="http://localhost:5001"
                className="flex-1 px-3 py-2 rounded-lg bg-background border border-neutral-200 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40 font-mono"
              />
              <button
                onClick={handleTest}
                disabled={!draftUrl.trim() || testStatus === "testing"}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 text-xs text-foreground-500 hover:text-foreground hover:border-primary-400 disabled:opacity-40 transition-colors shrink-0"
              >
                {testStatus === "testing" ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Wifi size={13} />
                )}
                Test
              </button>
            </div>

            {/* Test result */}
            {testResult && (
              <div
                className={`flex items-start gap-2 p-2.5 rounded-lg text-xs ${
                  testStatus === "ok"
                    ? "bg-success-50 border border-success-200 text-success-700"
                    : "bg-danger-50 border border-danger-200 text-danger-700"
                }`}
              >
                {testStatus === "ok" ? (
                  <CheckCircle2 size={13} className="shrink-0 mt-0.5" />
                ) : (
                  <XCircle size={13} className="shrink-0 mt-0.5" />
                )}
                <div>
                  {testStatus === "ok" ? (
                    <>
                      Connected
                      {testResult.latency != null
                        ? ` · ${testResult.latency}ms`
                        : ""}
                      {testResult.version && (
                        <span className="ml-1 font-mono">
                          ({testResult.version})
                        </span>
                      )}
                    </>
                  ) : (
                    (testResult.error ?? "Connection failed")
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-foreground">
                Enable Docling for sync
              </p>
              <p className="text-xs text-foreground-500">
                When enabled, all URL knowledge sources will be parsed through
                Docling
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDraftEnabled((v) => !v)}
              className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                draftEnabled ? "bg-primary-600" : "bg-neutral-300"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${
                  draftEnabled ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Docker tip */}
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-background border border-neutral-200/60 text-xs text-foreground-500">
            <span className="shrink-0 mt-0.5">💡</span>
            <span>
              Run Docling locally:{" "}
              <code className="font-mono text-primary-400 bg-background-200 px-1 rounded">
                docker run -p 5001:5001 quay.io/docling-project/docling-serve
              </code>
            </span>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <button
              onClick={cancelEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 text-xs text-foreground-500 hover:text-foreground transition-colors"
            >
              <X size={13} /> Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-xs font-medium transition-colors"
            >
              {saving ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Save size={13} />
              )}
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
