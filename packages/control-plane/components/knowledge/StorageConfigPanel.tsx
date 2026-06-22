"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Pencil,
  Save,
  Wifi,
  X,
  HardDrive,
  ArrowRight,
  Eye,
  EyeOff,
  MapPin,
} from "lucide-react";
import dynamic from "next/dynamic";
import { settingsClient, unwrap } from "@/lib/api/ts-rest/client";
import type {
  StorageConfig,
  StorageTestResult,
  StorageMigrateResult,
} from "@/lib/contracts";

const LocationEditor = dynamic(
  () => import("@/components/map/WorldMap").then((m) => m.LocationEditor),
  { ssr: false }
);

export function StorageConfigPanel() {
  const [cfg, setCfg] = useState<StorageConfig | null>(null);
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
  const [testResult, setTestResult] = useState<StorageTestResult | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] =
    useState<StorageMigrateResult | null>(null);
  const [locationEditing, setLocationEditing] = useState(false);
  const [storageLocation, setStorageLocation] = useState<{
    lat: number;
    lon: number;
    label: string;
  } | null>(null);

  async function handleSaveStorageLocation(
    loc: { lat: number; lon: number; label: string } | null
  ) {
    const body =
      loc === null
        ? { lat: null }
        : { lat: loc.lat, lon: loc.lon, label: loc.label };
    unwrap(await settingsClient.storageLocation({ body }));
    setStorageLocation(loc);
  }

  const loadCfg = useCallback(() => {
    settingsClient
      .getStorage()
      .then((res) => {
        const d = unwrap(res);
        setCfg(d);
        if (d.locationLat != null && d.locationLon != null) {
          setStorageLocation({
            lat: d.locationLat,
            lon: d.locationLon,
            label: d.locationLabel ?? "",
          });
        }
      })
      .catch(() => {});
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
      setTestResult(
        unwrap(
          await settingsClient.testStorage({
            body: {
              region: draftRegion.trim(),
              bucket: draftBucket.trim(),
              endpoint: draftEndpoint.trim() || undefined,
              accessKeyId: draftAccessKeyId.trim(),
              ...(draftSecretKey ? { secretAccessKey: draftSecretKey } : {}),
            },
          })
        )
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
      unwrap(
        await settingsClient.updateStorage({
          body: {
            storageType: draftEnabled ? "s3" : "filesystem",
            s3: {
              enabled: draftEnabled,
              region: draftRegion.trim(),
              bucket: draftBucket.trim(),
              endpoint: draftEndpoint.trim() || undefined,
              accessKeyId: draftAccessKeyId.trim(),
              ...(draftSecretKey ? { secretAccessKey: draftSecretKey } : {}),
            },
          },
        })
      );
      loadCfg();
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleMigrate() {
    setMigrating(true);
    setMigrateResult(null);
    try {
      setMigrateResult(unwrap(await settingsClient.migrateStorage()));
    } catch {
      setMigrateResult({
        success: false,
        migratedCount: 0,
        errorCount: 1,
        message: "Migration failed",
        hasMore: false,
      });
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
      className={`rounded-xl border bg-background-100 overflow-hidden transition-colors ${
        isS3Active ? "border-primary-300" : "border-neutral-200"
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            isS3Active ? "bg-primary-100" : "bg-neutral-100"
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
              <span className="truncate">
                {storageLocation.label ||
                  `${storageLocation.lat.toFixed(2)}, ${storageLocation.lon.toFixed(2)}`}
              </span>
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
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs ${
                      testResult.ok
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
              className={`flex items-center gap-2 p-2.5 rounded-lg text-xs ${
                (migrateResult.errorCount ?? 0) > 0
                  ? "bg-warning-50 border border-warning-200 text-warning-700"
                  : "bg-success-50 border border-success-200 text-success-700"
              }`}
            >
              <CheckCircle2 size={13} className="shrink-0" />
              {migrateResult.migratedCount === 0 &&
              (migrateResult.errorCount ?? 0) === 0
                ? "No files to migrate"
                : `Migrated ${migrateResult.migratedCount} file(s)${(migrateResult.errorCount ?? 0) > 0 ? `, ${migrateResult.errorCount} error(s)` : ""}`}
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
