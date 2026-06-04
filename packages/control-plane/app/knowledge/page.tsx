"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Globe,
  FileText,
  Bot,
  Globe2,
  AlertTriangle,
  ChevronRight,
  WifiOff,
  Database,
  ArrowUpRight,
  Cpu,
  Pencil,
  Save,
  RotateCcw,
  Wifi,
  X,
  HardDrive,
  ArrowRight,
  Eye,
  EyeOff,
  MapPin,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useRole } from "@/hooks/useRole";

const LocationEditor = dynamic(
  () => import("@/components/map/WorldMap").then((m) => m.LocationEditor),
  { ssr: false }
);

// ── Types ─────────────────────────────────────────────────────────────────────

interface KnowledgeSource {
  id: string;
  realm_id: string;
  agent_did: string;
  name: string;
  source_type: string;
  config: string;
  status: "idle" | "syncing" | "ready" | "error";
  doc_count: number;
  chunk_count: number;
  last_synced_at: string | null;
  error: string | null;
  created_at: string;
}

interface AgentInfo {
  did: string;
  name: string;
  online: boolean;
}

interface RealmInfo {
  id: string;
  name: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function fmtCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ── Docling config panel ──────────────────────────────────────────────────────

interface DoclingState {
  url: string;
  enabled: boolean;
  configured: boolean;
  locationLat?: number;
  locationLon?: number;
  locationLabel?: string;
}

type TestStatus = "idle" | "testing" | "ok" | "error";

function DoclingConfigPanel() {
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
  const [testResult, setTestResult] = useState<{
    latency?: number;
    version?: string;
    error?: string;
  } | null>(null);
  const [locationEditing, setLocationEditing] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lon: number; label: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings/docling")
      .then((r) => r.json())
      .then((d: DoclingState) => {
        setCfg(d);
        setDraftUrl(d.url ?? "");
        setDraftEnabled(d.enabled ?? false);
        if (d.locationLat != null && d.locationLon != null) {
          setLocation({ lat: d.locationLat, lon: d.locationLon, label: d.locationLabel ?? "" });
        }
      })
      .catch(() => { });
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
      const res = await fetch("/api/settings/docling/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: draftUrl.trim() }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        latency?: number;
        version?: string;
        error?: string;
      };
      setTestStatus(data.ok ? "ok" : "error");
      setTestResult(data);
    } catch (err) {
      setTestStatus("error");
      setTestResult({
        error: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  async function handleSaveDoclingLocation(loc: { lat: number; lon: number; label: string } | null) {
    const body = loc === null ? { lat: null } : { lat: loc.lat, lon: loc.lon, label: loc.label };
    const res = await fetch("/api/settings/docling/location", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(d?.error ?? "Failed to save location");
    }
    setLocation(loc);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/settings/docling", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: draftUrl.trim(), enabled: draftEnabled }),
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
      className={`rounded-xl border bg-background-100 overflow-hidden transition-colors ${cfg.enabled ? "border-primary-300" : "border-neutral-200"
        }`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cfg.enabled ? "bg-primary-100" : "bg-neutral-100"
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
              <span className="truncate">{location.label || `${location.lat.toFixed(2)}, ${location.lon.toFixed(2)}`}</span>
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
              <span className="truncate">{location.label || `${location.lat.toFixed(2)}, ${location.lon.toFixed(2)}`}</span>
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
                className={`flex items-start gap-2 p-2.5 rounded-lg text-xs ${testStatus === "ok"
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
              className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${draftEnabled ? "bg-primary-600" : "bg-neutral-300"
                }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${draftEnabled ? "translate-x-4" : "translate-x-0"
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

// ── Storage config panel ──────────────────────────────────────────────────────

interface StorageState {
  storageType: string;
  filesystem: { directory: string };
  s3: {
    enabled: boolean;
    configured: boolean;
    region: string;
    bucket: string;
    endpoint: string | null;
    accessKeyId: string;
  };
}

function StorageConfigPanel() {
  const [cfg, setCfg] = useState<StorageState | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftEnabled, setDraftEnabled] = useState(false);
  const [draftRegion, setDraftRegion] = useState("us-east-1");
  const [draftBucket, setDraftBucket] = useState("");
  const [draftEndpoint, setDraftEndpoint] = useState("");
  const [draftAccessKeyId, setDraftAccessKeyId] = useState("");
  const [draftSecretKey, setDraftSecretKey] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    latency?: number;
    error?: string;
  } | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState<{
    migratedCount: number;
    errorCount: number;
    hasMore: boolean;
  } | null>(null);
  const [locationEditing, setLocationEditing] = useState(false);
  const [storageLocation, setStorageLocation] = useState<{ lat: number; lon: number; label: string } | null>(null);

  async function handleSaveStorageLocation(loc: { lat: number; lon: number; label: string } | null) {
    const body = loc === null ? { lat: null } : { lat: loc.lat, lon: loc.lon, label: loc.label };
    const res = await fetch("/api/settings/storage/location", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(d?.error ?? "Failed to save location");
    }
    setStorageLocation(loc);
  }

  const loadCfg = useCallback(() => {
    fetch("/api/settings/storage")
      .then((r) => r.json())
      .then((d: StorageState) => setCfg(d))
      .catch(() => { });
  }, []);

  useEffect(() => {
    loadCfg();
  }, [loadCfg]);

  function startEdit() {
    if (!cfg) return;
    setDraftEnabled(cfg.s3.enabled);
    setDraftRegion(cfg.s3.region || "us-east-1");
    setDraftBucket(cfg.s3.bucket || "");
    setDraftEndpoint(cfg.s3.endpoint || "");
    setDraftAccessKeyId(cfg.s3.accessKeyId || "");
    setDraftSecretKey("");
    setShowSecret(false);
    setSaveError(null);
    setTestResult(null);
    setMigrateResult(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setSaveError(null);
    setTestResult(null);
    setMigrateResult(null);
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/settings/storage/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          region: draftRegion.trim(),
          bucket: draftBucket.trim(),
          endpoint: draftEndpoint.trim() || undefined,
          accessKeyId: draftAccessKeyId.trim(),
          ...(draftSecretKey ? { secretAccessKey: draftSecretKey } : {}),
        }),
      });
      setTestResult(
        (await res.json()) as { ok: boolean; latency?: number; error?: string }
      );
    } catch {
      setTestResult({ ok: false, error: "Network error" });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const body: Record<string, unknown> = {
        storageType: draftEnabled ? "s3" : "filesystem",
        s3: {
          enabled: draftEnabled,
          region: draftRegion.trim(),
          bucket: draftBucket.trim(),
          endpoint: draftEndpoint.trim() || undefined,
          accessKeyId: draftAccessKeyId.trim(),
          ...(draftSecretKey ? { secretAccessKey: draftSecretKey } : {}),
        },
      };
      const res = await fetch("/api/settings/storage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        loadCfg();
        setEditing(false);
      } else {
        const err = (await res.json()) as { error?: string };
        setSaveError(err.error ?? "Save failed");
      }
    } catch {
      setSaveError("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function handleMigrate() {
    setMigrating(true);
    setMigrateResult(null);
    try {
      const res = await fetch("/api/settings/storage/migrate", {
        method: "POST",
      });
      setMigrateResult(
        (await res.json()) as {
          migratedCount: number;
          errorCount: number;
          hasMore: boolean;
        }
      );
    } catch {
      setMigrateResult({ migratedCount: 0, errorCount: 1, hasMore: false });
    } finally {
      setMigrating(false);
    }
  }

  if (!cfg) return null;

  const isS3Active = cfg.storageType === "s3" && cfg.s3.enabled;

  const statusPill = isS3Active ? (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-700 bg-primary-100 border border-primary-300 rounded-full px-2.5 py-1">
      <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />
      S3 active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground-500 bg-background-200 border border-neutral-300 rounded-full px-2.5 py-1">
      <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
      Filesystem
    </span>
  );

  const saveDisabled =
    saving ||
    (draftEnabled &&
      (!draftRegion.trim() ||
        !draftBucket.trim() ||
        !draftAccessKeyId.trim() ||
        (!cfg.s3.configured && !draftSecretKey)));

  return (
    <div
      className={`rounded-xl border bg-background-100 overflow-hidden transition-colors ${isS3Active ? "border-primary-300" : "border-neutral-200"
        }`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isS3Active ? "bg-primary-100" : "bg-neutral-100"
            }`}
        >
          <HardDrive
            className={`w-4 h-4 ${isS3Active ? "text-primary-600" : "text-foreground-500"}`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              File Storage
            </span>
            {statusPill}
          </div>
          <p className="text-xs text-foreground-500 mt-0.5">
            Knowledge file storage backend — filesystem (default) or
            S3-compatible object storage
          </p>
        </div>
        {!editing && (
          <button
            onClick={startEdit}
            className="flex items-center gap-1.5 text-xs text-foreground-500 hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-background-200"
          >
            <Pencil size={13} /> Configure
          </button>
        )}
      </div>

      {/* Collapsed summary */}
      {!editing && (
        <div className="px-4 pb-3 flex items-center gap-3 text-xs text-foreground-500 border-t border-neutral-200/40 pt-2">
          {isS3Active ? (
            <>
              <span className="font-mono text-foreground truncate">
                {cfg.s3.bucket}
              </span>
              <span className="text-foreground-400">{cfg.s3.region}</span>
              {cfg.s3.endpoint && (
                <span className="font-mono text-foreground-400 truncate">
                  {cfg.s3.endpoint}
                </span>
              )}
            </>
          ) : (
            <span className="font-mono text-foreground truncate">
              {cfg.filesystem.directory}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <MapPin size={11} className="shrink-0" />
            {storageLocation ? (
              <span className="truncate">{storageLocation.label || `${storageLocation.lat.toFixed(2)}, ${storageLocation.lon.toFixed(2)}`}</span>
            ) : (
              <span className="italic text-foreground-400">No location</span>
            )}
            <button
              onClick={() => setLocationEditing(true)}
              className="text-primary-500 hover:text-primary-400 ml-1"
            >
              {storageLocation ? "Edit" : "Set"}
            </button>
          </div>
        </div>
      )}
      {locationEditing && (
        <LocationEditor
          current={storageLocation}
          onSave={handleSaveStorageLocation}
          onClose={() => setLocationEditing(false)}
        />
      )}

      {/* Edit form */}
      {editing && (
        <div className="px-4 pb-4 border-t border-neutral-200/40 pt-3 space-y-4">
          {/* S3 toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-foreground">
                Enable S3 storage
              </p>
              <p className="text-xs text-foreground-500">
                Store files in S3 or a compatible service (MinIO)
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDraftEnabled((v) => !v)}
              className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${draftEnabled ? "bg-primary-600" : "bg-neutral-300"}`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${draftEnabled ? "translate-x-4" : "translate-x-0"}`}
              />
            </button>
          </div>

          {/* S3 fields */}
          {draftEnabled && (
            <div className="space-y-3">
              {/* Region + Bucket */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground-500 uppercase tracking-wider">
                    Region
                  </label>
                  <input
                    value={draftRegion}
                    onChange={(e) => setDraftRegion(e.target.value)}
                    placeholder="us-east-1"
                    className="w-full px-3 py-2 rounded-lg bg-background border border-neutral-200 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground-500 uppercase tracking-wider">
                    Bucket
                  </label>
                  <input
                    value={draftBucket}
                    onChange={(e) => setDraftBucket(e.target.value)}
                    placeholder="vaultysclaw-knowledge"
                    className="w-full px-3 py-2 rounded-lg bg-background border border-neutral-200 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40 font-mono"
                  />
                </div>
              </div>

              {/* Endpoint */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground-500 uppercase tracking-wider">
                  Custom endpoint{" "}
                  <span className="normal-case font-normal">
                    (optional — MinIO or S3-compatible)
                  </span>
                </label>
                <input
                  value={draftEndpoint}
                  onChange={(e) => setDraftEndpoint(e.target.value)}
                  placeholder="http://localhost:9000"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-neutral-200 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40 font-mono"
                />
              </div>

              {/* Credentials */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground-500 uppercase tracking-wider">
                  Access Key ID
                </label>
                <input
                  value={draftAccessKeyId}
                  onChange={(e) => setDraftAccessKeyId(e.target.value)}
                  placeholder="AKIAIOSFODNN7EXAMPLE"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-neutral-200 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40 font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground-500 uppercase tracking-wider">
                  Secret Access Key
                  {cfg.s3.configured && (
                    <span className="ml-1 normal-case font-normal text-foreground-400">
                      (leave blank to keep existing)
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type={showSecret ? "text" : "password"}
                    value={draftSecretKey}
                    onChange={(e) => setDraftSecretKey(e.target.value)}
                    placeholder={
                      cfg.s3.configured
                        ? "••••••••"
                        : "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                    }
                    className="w-full px-3 py-2 pr-9 rounded-lg bg-background border border-neutral-200 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((s) => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-foreground-400 hover:text-foreground transition"
                  >
                    {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {/* Test connection */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={
                    testing || !draftBucket.trim() || !draftAccessKeyId.trim()
                  }
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 text-xs text-foreground-500 hover:text-foreground hover:border-primary-400 disabled:opacity-40 transition-colors"
                >
                  {testing ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Wifi size={13} />
                  )}
                  Test connection
                </button>
                {testResult && (
                  <div
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs ${testResult.ok
                      ? "bg-success-50 border border-success-200 text-success-700"
                      : "bg-danger-50 border border-danger-200 text-danger-700"
                      }`}
                  >
                    {testResult.ok ? (
                      <CheckCircle2 size={13} className="shrink-0" />
                    ) : (
                      <XCircle size={13} className="shrink-0" />
                    )}
                    {testResult.ok
                      ? `Connected${testResult.latency != null ? ` · ${testResult.latency}ms` : ""}`
                      : testResult.error}
                  </div>
                )}
              </div>

              {/* MinIO tip */}
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-background border border-neutral-200/60 text-xs text-foreground-500">
                <span className="shrink-0 mt-0.5">💡</span>
                <div className="space-y-1">
                  <p>Run MinIO locally with Docker:</p>
                  <code className="block font-mono text-primary-400 bg-background-200 px-2 py-1 rounded leading-relaxed whitespace-pre">
                    {`docker run -p 9000:9000 -p 9001:9001 \\
 -e MINIO_ROOT_USER=minioadmin \\
 -e MINIO_ROOT_PASSWORD=minioadmin \\
 minio/minio server /data --console-address :9001`}
                  </code>
                  <p className="text-foreground-400">
                    Use{" "}
                    <code className="font-mono text-primary-400 bg-background-200 px-1 rounded">
                      minioadmin
                    </code>{" "}
                    as both access key and secret key.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Save error */}
          {saveError && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-danger-50 border border-danger-200 text-xs text-danger-700">
              <XCircle size={13} className="shrink-0" /> {saveError}
            </div>
          )}

          {/* Migrate existing files */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-background border border-neutral-200/60">
            <div>
              <p className="text-xs font-medium text-foreground">
                Migrate existing files
              </p>
              <p className="text-xs text-foreground-500">
                Move legacy database BLOBs to the current storage backend
              </p>
            </div>
            <button
              type="button"
              onClick={handleMigrate}
              disabled={migrating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 text-xs text-foreground-500 hover:text-foreground hover:border-primary-400 disabled:opacity-40 transition-colors shrink-0"
            >
              {migrating ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <ArrowRight size={13} />
              )}
              Migrate
            </button>
          </div>
          {migrateResult && (
            <div
              className={`flex items-center gap-2 p-2.5 rounded-lg text-xs ${migrateResult.errorCount > 0
                ? "bg-warning-50 border border-warning-200 text-warning-700"
                : "bg-success-50 border border-success-200 text-success-700"
                }`}
            >
              <CheckCircle2 size={13} className="shrink-0" />
              {migrateResult.migratedCount === 0 &&
                migrateResult.errorCount === 0
                ? "No files to migrate"
                : `Migrated ${migrateResult.migratedCount} file(s)${migrateResult.errorCount > 0 ? `, ${migrateResult.errorCount} error(s)` : ""}`}
              {migrateResult.hasMore && " — run again for more"}
            </div>
          )}

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
              disabled={saveDisabled}
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

// ── Badges ────────────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: KnowledgeSource["status"] }) {
  const map = {
    idle: "bg-neutral-400",
    syncing: "bg-primary-500 animate-pulse",
    ready: "bg-success-500",
    error: "bg-danger-500",
  };
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${map[status] ?? map.idle}`}
    />
  );
}

function StatusBadge({ status }: { status: KnowledgeSource["status"] }) {
  const map = {
    idle: {
      icon: <Clock size={12} />,
      label: "Idle",
      cls: "bg-neutral-100 text-neutral-500 border-neutral-300",
    },
    syncing: {
      icon: <Loader2 size={12} className="animate-spin" />,
      label: "Syncing",
      cls: "bg-primary-100 text-primary-700 border-primary-300",
    },
    ready: {
      icon: <CheckCircle2 size={12} />,
      label: "Ready",
      cls: "bg-success-100 text-success-700 border-success-300",
    },
    error: {
      icon: <XCircle size={12} />,
      label: "Error",
      cls: "bg-danger-100 text-danger-700 border-danger-300",
    },
  };
  const { icon, label, cls } = map[status] ?? map.idle;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${cls}`}
    >
      {icon} {label}
    </span>
  );
}

function TypeIcon({ type }: { type: string }) {
  if (type === "url")
    return <Globe size={13} className="text-primary-400 shrink-0" />;
  return <FileText size={13} className="text-warning-400 shrink-0" />;
}

// ── Agent card ────────────────────────────────────────────────────────────────

function AgentKnowledgeCard({
  agent,
  sources,
  realms,
}: {
  agent: AgentInfo;
  sources: KnowledgeSource[];
  realms: RealmInfo[];
}) {
  const [expanded, setExpanded] = useState(true);

  const totalChunks = sources.reduce((sum, s) => sum + (s.chunk_count ?? 0), 0);
  const readyCount = sources.filter((s) => s.status === "ready").length;
  const errorCount = sources.filter((s) => s.status === "error").length;

  const realmName = (id: string) => realms.find((r) => r.id === id)?.name ?? id;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-background-100 overflow-hidden">
      {/* Card header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-background-200/30 transition-colors select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Agent avatar */}
        <div className="w-8 h-8 rounded-full bg-primary-600/20 border border-primary-500/30 flex items-center justify-center shrink-0">
          <Bot size={16} className="text-primary-400" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground truncate">
              {agent.name}
            </span>
            {agent.online ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-success-700 bg-success-100 border border-success-300 rounded-full px-1.5 py-0.5">
                <span className="w-1.5 h-1.5 bg-success-500 rounded-full animate-pulse" />
                Online
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-foreground-500 bg-background-200 border border-neutral-300 rounded-full px-1.5 py-0.5">
                <WifiOff size={9} />
                Offline
              </span>
            )}
          </div>
          <p className="text-xs text-foreground-400 font-mono truncate mt-0.5">
            {agent.did}
          </p>
        </div>

        {/* Summary stats */}
        <div className="hidden sm:flex items-center gap-4 text-xs text-foreground-500 shrink-0">
          <div className="text-right">
            <div className="text-foreground font-semibold">
              {sources.length}
            </div>
            <div>source{sources.length !== 1 ? "s" : ""}</div>
          </div>
          <div className="text-right">
            <div className="text-foreground font-semibold">
              {fmtCount(totalChunks)}
            </div>
            <div>chunks</div>
          </div>
          {errorCount > 0 && (
            <div className="flex items-center gap-1 text-danger-500">
              <AlertTriangle size={13} />
              <span>
                {errorCount} error{errorCount > 1 ? "s" : ""}
              </span>
            </div>
          )}
          {readyCount === sources.length && sources.length > 0 && (
            <div className="flex items-center gap-1 text-success-600">
              <CheckCircle2 size={13} />
              <span>All ready</span>
            </div>
          )}
        </div>

        {/* Manage link */}
        <Link
          href={`/agents/${encodeURIComponent(agent.did)}`}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 text-xs text-primary-500 hover:text-primary-400 transition-colors shrink-0 ml-2"
          title="Manage on agent page"
        >
          Manage
          <ArrowUpRight size={13} />
        </Link>

        <ChevronRight
          size={16}
          className={`text-foreground-400 transition-transform shrink-0 ${expanded ? "rotate-90" : ""}`}
        />
      </div>

      {/* Sources list */}
      {expanded && (
        <div className="border-t border-neutral-200/60">
          {sources.length === 0 ? (
            <div className="px-4 py-5 text-center">
              <p className="text-xs text-foreground-500">
                No knowledge sources configured for this agent.
              </p>
              <Link
                href={`/agents/${encodeURIComponent(agent.did)}`}
                className="text-xs text-primary-500 hover:text-primary-400 mt-1 inline-flex items-center gap-1"
              >
                Add sources on the agent page <ArrowUpRight size={11} />
              </Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-foreground-500 text-xs uppercase tracking-wider border-b border-neutral-200/40 bg-background/60">
                  <th className="text-left px-4 py-2 font-medium">Source</th>
                  <th className="text-left px-4 py-2 font-medium hidden md:table-cell">
                    Realm
                  </th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-left px-4 py-2 font-medium hidden sm:table-cell">
                    Chunks
                  </th>
                  <th className="text-left px-4 py-2 font-medium hidden lg:table-cell">
                    Last sync
                  </th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source, i) => {
                  let config: Record<string, unknown> = {};
                  try {
                    config = JSON.parse(source.config);
                  } catch {
                    /**/
                  }
                  const urls = Array.isArray(config.urls)
                    ? (config.urls as string[])
                    : [];

                  return (
                    <tr
                      key={source.id}
                      className={`border-b border-neutral-200/30 last:border-0 ${i % 2 === 0 ? "" : "bg-background/40"}`}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <TypeIcon type={source.source_type} />
                          <div className="min-w-0">
                            <span className="text-xs font-medium text-foreground truncate block max-w-[180px]">
                              {source.name}
                            </span>
                            {source.source_type === "url" &&
                              urls.length > 0 && (
                                <span className="text-[10px] text-foreground-400 truncate block max-w-[180px]">
                                  {urls[0]}
                                  {urls.length > 1
                                    ? ` +${urls.length - 1}`
                                    : ""}
                                </span>
                              )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 hidden md:table-cell">
                        <span className="flex items-center gap-1.5 text-xs text-foreground-500">
                          <Globe2 size={11} className="shrink-0" />
                          {realmName(source.realm_id)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={source.status} />
                        {source.error && (
                          <p
                            className="text-[10px] text-danger-500 mt-0.5 max-w-[200px] truncate"
                            title={source.error}
                          >
                            {source.error}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 hidden sm:table-cell text-xs text-foreground-500">
                        {source.status === "ready" ? (
                          <span className="text-foreground font-medium">
                            {fmtCount(source.chunk_count)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-2.5 hidden lg:table-cell text-xs text-foreground-500">
                        {timeAgo(source.last_synced_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function KnowledgeDashboardPage() {
  const router = useRouter();
  const { isGlobalAdmin, isLoading: roleLoading } = useRole();

  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [realms, setRealms] = useState<RealmInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roleLoading && !isGlobalAdmin) router.replace("/");
  }, [roleLoading, isGlobalAdmin, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ksRes, agRes, rlRes] = await Promise.all([
        fetch("/api/knowledge"),
        fetch("/api/agents"),
        fetch("/api/realms"),
      ]);
      const ksData = (await ksRes.json()) as { sources?: KnowledgeSource[] };
      const agData = (await agRes.json()) as { agents?: AgentInfo[] };
      const rlData = (await rlRes.json()) as { realms?: RealmInfo[] };
      setSources(ksData.sources ?? []);
      setAgents(agData.agents ?? []);
      setRealms(rlData.realms ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while syncing
  useEffect(() => {
    if (!sources.some((s) => s.status === "syncing")) return;
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [sources, load]);

  if (roleLoading || !isGlobalAdmin) return null;

  // Summary stats
  const totalSources = sources.length;
  const readySources = sources.filter((s) => s.status === "ready").length;
  const totalChunks = sources.reduce((sum, s) => sum + (s.chunk_count ?? 0), 0);
  const errorSources = sources.filter((s) => s.status === "error").length;
  const agentsWithKnowledge = new Set(sources.map((s) => s.agent_did)).size;

  // Agents that have at least one knowledge source, plus those that are online
  // Show all agents — those without sources show an empty state encouraging setup
  const agentsWithSources = agents.filter((a) =>
    sources.some((s) => s.agent_did === a.did)
  );

  return (
    <div className="p-6 w-full max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-primary-700" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              Knowledge Overview
            </h1>
            <p className="text-xs text-foreground-500">
              Data access map — which agents index what, and for which realm
            </p>
          </div>
        </div>
        {loading && (
          <Loader2 size={16} className="animate-spin text-foreground-500" />
        )}
      </div>

      {/* Docling config */}
      <DoclingConfigPanel />

      {/* Storage config */}
      <StorageConfigPanel />

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            label: "Total sources",
            value: totalSources,
            sub: "configured",
            icon: <BookOpen size={16} />,
            tone: "neutral",
          },
          {
            label: "Ready",
            value: readySources,
            sub: "indexed & live",
            icon: <CheckCircle2 size={16} />,
            tone:
              readySources === totalSources && totalSources > 0
                ? "ok"
                : "neutral",
          },
          {
            label: "Total chunks",
            value: fmtCount(totalChunks),
            sub: "stored locally",
            icon: <Database size={16} />,
            tone: "neutral",
          },
          {
            label: "Agents with RAG",
            value: agentsWithKnowledge,
            sub: "knowledge-enabled",
            icon: <Bot size={16} />,
            tone:
              errorSources > 0
                ? "danger"
                : agentsWithKnowledge > 0
                  ? "ok"
                  : "neutral",
          },
        ].map((card) => (
          <div
            key={card.label}
            className="bg-background-100 border border-neutral-200 rounded-xl p-4 flex flex-col gap-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-foreground-400 uppercase tracking-wider font-medium">
                {card.label}
              </span>
              <span
                className={
                  card.tone === "ok"
                    ? "text-success-500"
                    : card.tone === "danger"
                      ? "text-danger-500"
                      : "text-primary-500"
                }
              >
                {card.icon}
              </span>
            </div>
            <p className="text-2xl font-bold text-foreground">{card.value}</p>
            {card.sub && (
              <p className="text-xs text-foreground-400">{card.sub}</p>
            )}
          </div>
        ))}
      </div>

      {/* Error alert */}
      {errorSources > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-danger-50 border border-danger-200">
          <AlertTriangle
            size={16}
            className="text-danger-500 mt-0.5 shrink-0"
          />
          <div>
            <p className="text-sm font-medium text-danger-700">
              {errorSources} source{errorSources > 1 ? "s" : ""} failed to sync
            </p>
            <p className="text-xs text-danger-600/80 mt-0.5">
              Go to the agent&apos;s Knowledge tab to retry or inspect the
              error.
            </p>
          </div>
        </div>
      )}

      {/* Agent cards */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-foreground-500">
          <Loader2 size={16} className="animate-spin" /> Loading…
        </div>
      ) : agentsWithSources.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 border-dashed bg-background-100/40 p-12 text-center space-y-3">
          <BookOpen className="w-8 h-8 text-foreground-400 mx-auto" />
          <p className="text-sm font-medium text-foreground">
            No knowledge sources configured yet
          </p>
          <p className="text-xs text-foreground-500 max-w-md mx-auto">
            Open any agent page, go to the <strong>Knowledge</strong> tab, and
            connect a URL or text source. Once synced, the agent will
            automatically use{" "}
            <code className="bg-background-200 px-1 rounded text-primary-400">
              knowledge_search
            </code>{" "}
            in conversations.
          </p>
          <Link
            href="/agents"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors"
          >
            <Bot size={14} />
            Go to Agents
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              {agentsWithSources.length} agent
              {agentsWithSources.length !== 1 ? "s" : ""} with knowledge sources
            </h2>
            <p className="text-xs text-foreground-500">
              Manage sources from each agent&apos;s{" "}
              <span className="text-foreground">Knowledge tab</span>
            </p>
          </div>

          {agentsWithSources.map((agent) => (
            <AgentKnowledgeCard
              key={agent.did}
              agent={agent}
              sources={sources.filter((s) => s.agent_did === agent.did)}
              realms={realms}
            />
          ))}
        </div>
      )}

      {/* Status legend + info */}
      {agentsWithSources.length > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-background-100/60 p-4 space-y-3">
          <p className="text-xs font-semibold text-foreground">
            Status reference
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-foreground-500">
            <span className="flex items-center gap-1.5">
              <StatusDot status="idle" /> Idle — created, not yet synced
            </span>
            <span className="flex items-center gap-1.5">
              <StatusDot status="syncing" /> Syncing — agent is ingesting
            </span>
            <span className="flex items-center gap-1.5">
              <StatusDot status="ready" /> Ready — chunks indexed &amp;
              searchable
            </span>
            <span className="flex items-center gap-1.5">
              <StatusDot status="error" /> Error — sync failed, check agent page
            </span>
          </div>
          <p className="text-xs text-foreground-500 pt-1 border-t border-neutral-200/60">
            Data is stored{" "}
            <strong className="text-foreground">locally on the agent</strong> as
            vector embeddings. It never leaves the agent&apos;s environment. To
            add, re-sync or remove sources, navigate to the agent and open the{" "}
            <strong className="text-foreground">Knowledge</strong> tab.
          </p>
        </div>
      )}
    </div>
  );
}
