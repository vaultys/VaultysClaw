"use client";

import { useState, useEffect } from "react";
import { HardDrive, Loader2, Edit2 } from "lucide-react";
import {
  Field,
  StatusBadge,
  IntegrationPanel,
  IntegrationHeader,
  IntegrationModal,
} from "./shared";

interface StorageStatus {
  storageType: "filesystem" | "s3";
  filesystem?: { directory: string };
  s3?: {
    enabled: boolean;
    region: string;
    bucket: string;
    endpoint: string;
    accessKeyId: string;
    configured: boolean;
  };
}

export function StoragePanel() {
  const [status, setStatus] = useState<StorageStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [storageType, setStorageType] = useState<"filesystem" | "s3">("filesystem");
  const [bucket, setBucket] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      const r = await fetch("/api/settings/storage");
      const data = (await r.json()) as StorageStatus;
      setStatus(data);
      setStorageType(data.storageType);
      if (data.s3) {
        setBucket(data.s3.bucket || "");
        setEndpoint(data.s3.endpoint || "");
        setRegion(data.s3.region || "us-east-1");
        setAccessKey(data.s3.accessKeyId || "");
      }
    } catch {
      setStatus({ storageType: "filesystem" });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const body: Record<string, unknown> = { storageType };
      if (storageType === "s3") {
        body.s3 = { bucket, endpoint, region, accessKeyId: accessKey, secretAccessKey: secretKey };
      }
      const r = await fetch("/api/settings/storage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        setIsModalOpen(false);
        await loadStatus();
      }
    } catch {
      // error handled by user feedback
    } finally {
      setIsSaving(false);
    }
  };

  const configured = status?.storageType === "s3" ? (status?.s3?.configured ?? false) : true;
  const description =
    status?.storageType === "s3"
      ? `S3: ${status?.s3?.bucket || "(no bucket)"}`
      : `Filesystem: ${status?.filesystem?.directory || "default"}`;

  return (
    <>
      <IntegrationPanel>
        <IntegrationHeader
          icon={HardDrive}
          title="Object Storage"
          description="File storage backend (filesystem or S3)"
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
                    <p className="text-sm font-medium text-foreground">Storage Type</p>
                    <p className="text-xs text-foreground-400">{description}</p>
                  </div>
                  <StatusBadge
                    status={configured ? "success" : "warning"}
                    message={configured ? "Configured" : "Unconfigured"}
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
        title="Configure Object Storage"
        onSave={handleSave}
        isSaving={isSaving}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-foreground mb-2">Storage Type</label>
            <select
              value={storageType}
              onChange={(e) => setStorageType(e.target.value as "filesystem" | "s3")}
              className="w-full px-3 py-2 rounded-lg bg-background-200 border border-neutral-300 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="filesystem">Filesystem</option>
              <option value="s3">S3 / S3-compatible (MinIO)</option>
            </select>
          </div>

          {storageType === "s3" && (
            <>
              <Field label="Bucket" id="s3-bucket" value={bucket} onChange={setBucket} placeholder="my-bucket" />
              <Field label="Region" id="s3-region" value={region} onChange={setRegion} placeholder="us-east-1" />
              <Field
                label="Endpoint (optional)"
                id="s3-endpoint"
                value={endpoint}
                onChange={setEndpoint}
                placeholder="http://minio.example.com:9000"
              />
              <Field
                label="Access Key ID"
                id="s3-key"
                value={accessKey}
                onChange={setAccessKey}
                showToggle
              />
              <Field
                label="Secret Access Key"
                id="s3-secret"
                value={secretKey}
                onChange={setSecretKey}
                placeholder="Leave empty to keep current"
                showToggle
              />
            </>
          )}
        </div>
      </IntegrationModal>
    </>
  );
}
