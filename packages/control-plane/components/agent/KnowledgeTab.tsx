"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Loader2,
  Plus,
  BookOpen,
  WifiOff,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Trash2,
  Globe,
  Globe2,
  FileText,
  FileType2,
  Layers,
  File,
  Upload,
  X,
  ChevronUp,
  ChevronDown,
  Clock,
} from "lucide-react";
import { timeAgo } from "@vaultysclaw/shared";
import { ConfirmModal } from "@/components/shared/ConfirmModal";

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

interface KsRealmOption {
  id: string;
  name: string;
}

interface KnowledgeFile {
  id: string;
  name: string;
  mime_type: string;
  size: number;
}

type KsSourceType = "url" | "text" | "files";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function relativeTime(isoString: string | null): string {
  if (!isoString) return "Never";
  const iso = isoString;
  const d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function mimeIcon(mime: string): React.ReactNode {
  if (mime === "application/pdf")
    return <FileType2 size={13} className="text-danger-400 shrink-0" />;
  if (mime.includes("word") || mime.includes("document"))
    return <FileText size={13} className="text-primary-400 shrink-0" />;
  if (mime === "text/markdown" || mime === "text/plain")
    return <FileText size={13} className="text-neutral-400 shrink-0" />;
  if (mime === "text/csv")
    return <Layers size={13} className="text-success-400 shrink-0" />;
  return <File size={13} className="text-foreground-400 shrink-0" />;
}

function KsStatusBadge({ status }: { status: KnowledgeSource["status"] }) {
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

// ---------------------------------------------------------------------------
// FileDropzone
// ---------------------------------------------------------------------------

interface FileDropzoneProps {
  files: File[];
  onAdd: (added: File[]) => void;
  onRemove: (index: number) => void;
}

function FileDropzone({ files, onAdd, onRemove }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    onAdd(Array.from(e.dataTransfer.files));
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      onAdd(Array.from(e.target.files));
      e.target.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-2 px-4 py-8 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
          dragging
            ? "border-primary-500 bg-primary-50"
            : "border-neutral-200 hover:border-primary-400 hover:bg-background-200/40 bg-background"
        }`}
      >
        <Upload
          size={22}
          className={dragging ? "text-primary-500" : "text-foreground-400"}
        />
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">
            Drop files here or click to browse
          </p>
          <p className="text-xs text-foreground-500 mt-0.5">
            PDF, DOCX, TXT, Markdown, CSV — up to 10 MB each
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.doc,.txt,.md,.csv"
          className="hidden"
          onChange={handleChange}
        />
      </div>

      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((f, i) => {
            const oversized = f.size > 10 * 1024 * 1024;
            return (
              <li
                key={`${f.name}-${i}`}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
                  oversized
                    ? "border-danger-300 bg-danger-50"
                    : "border-neutral-200 bg-background-200/40"
                }`}
              >
                <File
                  size={13}
                  className={
                    oversized
                      ? "text-danger-400 shrink-0"
                      : "text-foreground-400 shrink-0"
                  }
                />
                <span
                  className={`flex-1 truncate ${oversized ? "text-danger-600" : "text-foreground"}`}
                >
                  {f.name}
                </span>
                <span
                  className={`shrink-0 ${oversized ? "text-danger-500" : "text-foreground-500"}`}
                >
                  {formatBytes(f.size)}
                </span>
                {oversized && (
                  <span className="shrink-0 text-danger-500 font-medium">
                    Too large
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  className="shrink-0 text-foreground-400 hover:text-danger-500 transition-colors"
                >
                  <X size={13} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KsSourceCard
// ---------------------------------------------------------------------------

interface KsSourceCardProps {
  source: KnowledgeSource;
  realmName: string;
  isSyncing: boolean;
  isDeleting: boolean;
  isExpanded: boolean;
  online: boolean;
  onToggleExpand: () => void;
  onSync: () => void;
  onDelete: () => void;
}

function KsSourceCard({
  source,
  realmName,
  isSyncing,
  isDeleting,
  isExpanded,
  online,
  onToggleExpand,
  onSync,
  onDelete,
}: KsSourceCardProps) {
  const [files, setFiles] = useState<KnowledgeFile[] | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);

  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(source.config);
  } catch {
    /**/
  }

  const typeIconMap: Record<string, React.ReactNode> = {
    url: <Globe size={16} className="text-primary-400" />,
    text: <FileText size={16} className="text-warning-400" />,
    files: <FileType2 size={16} className="text-success-400" />,
  };
  const typeIcon = typeIconMap[source.source_type] ?? (
    <File size={16} className="text-foreground-400" />
  );

  async function loadFiles() {
    if (files !== null || source.source_type !== "files") return;
    setLoadingFiles(true);
    try {
      const res = await fetch(
        `/api/knowledge/files?sourceId=${encodeURIComponent(source.id)}`
      );
      const data = (await res.json()) as { files?: KnowledgeFile[] };
      setFiles(data.files ?? []);
    } finally {
      setLoadingFiles(false);
    }
  }

  function handleExpand() {
    if (!isExpanded && source.source_type === "files") {
      loadFiles();
    }
    onToggleExpand();
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-background-100 overflow-hidden transition-all">
      <div
        className="flex items-start gap-3 px-4 py-3.5 cursor-pointer hover:bg-background-200/30 transition-colors"
        onClick={handleExpand}
      >
        <div className="mt-0.5 shrink-0 w-8 h-8 rounded-lg bg-background border border-neutral-200 flex items-center justify-center">
          {typeIcon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground truncate">
              {source.name}
            </span>
            <KsStatusBadge status={source.status} />
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-foreground-500 flex-wrap">
            <Globe2 size={11} className="shrink-0" />
            <span>{realmName}</span>
            <span className="text-foreground-400">·</span>
            <Layers size={11} className="shrink-0" />
            <span>
              {source.chunk_count > 0
                ? `${source.chunk_count.toLocaleString()} chunks`
                : "No chunks yet"}
            </span>
            <span className="text-foreground-400">·</span>
            <span>{relativeTime(source.last_synced_at)}</span>
          </div>
        </div>

        <div
          className="flex items-center gap-1 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onSync}
            disabled={isSyncing || isDeleting || !online}
            title={online ? "Sync now" : "Agent offline"}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-foreground-500 hover:text-primary-500 hover:bg-primary-50 disabled:opacity-40 border border-neutral-200 hover:border-primary-300 transition-colors"
          >
            {isSyncing ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
            Sync
          </button>
          <button
            onClick={onDelete}
            disabled={isDeleting}
            title="Delete source"
            className="p-1.5 rounded-lg text-foreground-500 hover:text-danger-500 hover:bg-danger-50 disabled:opacity-40 border border-transparent hover:border-danger-200 transition-colors"
          >
            {isDeleting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Trash2 size={14} />
            )}
          </button>
          <div className="pl-1 text-foreground-400">
            {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-neutral-200 px-4 pb-4 pt-3 space-y-3 bg-background">
          {source.error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-danger-50 border border-danger-200">
              <XCircle size={14} className="text-danger-500 mt-0.5 shrink-0" />
              <p className="text-xs text-danger-600 font-mono break-all">
                {source.error}
              </p>
            </div>
          )}

          {source.source_type === "url" && Array.isArray(config.urls) && (
            <div className="space-y-1">
              <p className="text-xs text-foreground-500 font-medium uppercase tracking-wider">
                Indexed URLs
              </p>
              <ul className="space-y-1">
                {(config.urls as string[]).map((url) => (
                  <li
                    key={url}
                    className="flex items-center gap-2 text-xs text-foreground"
                  >
                    <Globe size={11} className="text-foreground-400 shrink-0" />
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-primary-500 truncate"
                    >
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {source.source_type === "text" && Array.isArray(config.texts) && (
            <div className="space-y-1">
              <p className="text-xs text-foreground-500 font-medium uppercase tracking-wider">
                Documents
              </p>
              <ul className="space-y-1">
                {(config.texts as { title: string }[]).map((t, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 text-xs text-foreground"
                  >
                    <FileText
                      size={11}
                      className="text-foreground-400 shrink-0"
                    />
                    {t.title}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {source.source_type === "files" && (
            <div className="space-y-1">
              <p className="text-xs text-foreground-500 font-medium uppercase tracking-wider">
                Uploaded Files
              </p>
              {loadingFiles ? (
                <div className="flex items-center gap-2 py-2 text-xs text-foreground-500">
                  <Loader2 size={12} className="animate-spin" /> Loading files…
                </div>
              ) : files && files.length > 0 ? (
                <ul className="space-y-1">
                  {files.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center gap-2 text-xs text-foreground"
                    >
                      {mimeIcon(f.mime_type)}
                      <span className="flex-1 truncate">{f.name}</span>
                      <span className="text-foreground-500 shrink-0">
                        {formatBytes(f.size)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-foreground-400 italic">
                  No files found.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-4 text-xs text-foreground-500 pt-1 border-t border-neutral-200/60">
            {config.chunkSize != null && (
              <span>
                Chunk size:{" "}
                <span className="text-foreground">
                  {String(config.chunkSize)}
                </span>
              </span>
            )}
            <span>
              Created:{" "}
              <span className="text-foreground">
                {new Date(
                  source.created_at.endsWith("Z")
                    ? source.created_at
                    : source.created_at + "Z"
                ).toLocaleDateString()}
              </span>
            </span>
            <span>
              ID:{" "}
              <span className="text-foreground font-mono">{source.id}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KsAddSourceModal
// ---------------------------------------------------------------------------

interface KsAddSourceModalProps {
  did: string;
  realms: KsRealmOption[];
  doclingConfigured: boolean;
  onClose: () => void;
  onCreated: () => void;
}

function KsAddSourceModal({
  did,
  realms,
  doclingConfigured,
  onClose,
  onCreated,
}: KsAddSourceModalProps) {
  const [name, setName] = useState("");
  const [realmId, setRealmId] = useState(realms[0]?.id ?? "");
  const [sourceType, setSourceType] = useState<KsSourceType>("url");
  const [urls, setUrls] = useState("");
  const [textTitle, setTextTitle] = useState("");
  const [textContent, setTextContent] = useState("");
  const [chunkSize, setChunkSize] = useState("1000");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasOversizedFile = selectedFiles.some((f) => f.size > 10 * 1024 * 1024);

  function handleAddFiles(added: File[]) {
    setSelectedFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name));
      const next = [...prev, ...added.filter((f) => !existing.has(f.name))];
      if (!name.trim() && next.length > 0) {
        setName(next[0].name.replace(/\.[^.]+$/, ""));
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Source name is required.");
      return;
    }
    if (!realmId) {
      setError("Please select a realm.");
      return;
    }
    if (hasOversizedFile) {
      setError("Remove files that exceed the 10 MB limit.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (sourceType === "url") {
        const list = urls
          .split("\n")
          .map((u) => u.trim())
          .filter(Boolean);
        if (!list.length) {
          setError("Enter at least one URL.");
          setSaving(false);
          return;
        }
        const res = await fetch("/api/knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            realmId,
            agentDid: did,
            name: name.trim(),
            sourceType: "url",
            config: { chunkSize: parseInt(chunkSize, 10) || 1000, urls: list },
          }),
        });
        if (!res.ok) {
          const d = (await res.json()) as { error?: string };
          throw new Error(d.error ?? "Failed to create source");
        }
      } else if (sourceType === "text") {
        if (!textTitle.trim() || !textContent.trim()) {
          setError("Title and content are required for text sources.");
          setSaving(false);
          return;
        }
        const res = await fetch("/api/knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            realmId,
            agentDid: did,
            name: name.trim(),
            sourceType: "text",
            config: {
              chunkSize: parseInt(chunkSize, 10) || 1000,
              texts: [{ title: textTitle.trim(), content: textContent.trim() }],
            },
          }),
        });
        if (!res.ok) {
          const d = (await res.json()) as { error?: string };
          throw new Error(d.error ?? "Failed to create source");
        }
      } else {
        if (!selectedFiles.length) {
          setError("Select at least one file to upload.");
          setSaving(false);
          return;
        }
        const sourceRes = await fetch("/api/knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            realmId,
            agentDid: did,
            name: name.trim(),
            sourceType: "files",
            config: { chunkSize: parseInt(chunkSize, 10) || 1000 },
          }),
        });
        if (!sourceRes.ok) {
          const d = (await sourceRes.json()) as { error?: string };
          throw new Error(d.error ?? "Failed to create source");
        }
        const { source } = (await sourceRes.json()) as {
          source: { id: string };
        };
        for (let i = 0; i < selectedFiles.length; i++) {
          const file = selectedFiles[i];
          setUploadProgress(
            `Uploading ${i + 1}/${selectedFiles.length}: ${file.name}`
          );
          const fd = new FormData();
          fd.append("sourceId", source.id);
          fd.append("file", file);
          const uploadRes = await fetch("/api/knowledge/files", {
            method: "POST",
            body: fd,
          });
          if (!uploadRes.ok) {
            const d = (await uploadRes.json()) as { error?: string };
            throw new Error(d.error ?? `Failed to upload ${file.name}`);
          }
        }
        setUploadProgress(null);
      }

      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setUploadProgress(null);
    } finally {
      setSaving(false);
    }
  }

  const sourceTypeOptions: {
    value: KsSourceType;
    icon: React.ReactNode;
    label: string;
    description: string;
  }[] = [
    {
      value: "url",
      icon: <Globe size={18} className="text-primary-400" />,
      label: "URL Sources",
      description: "Fetch and index web pages or API docs",
    },
    {
      value: "text",
      icon: <FileText size={18} className="text-warning-400" />,
      label: "Inline Text",
      description: "Paste text directly from any source",
    },
    {
      value: "files",
      icon: <FileType2 size={18} className="text-success-400" />,
      label: "Documents",
      description: "Upload PDF, DOCX, TXT or Markdown files",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-background-100 border border-neutral-200 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary-500" />
            <h2 className="text-sm font-semibold text-foreground">
              Add Knowledge Source
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-foreground-500 hover:text-foreground transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-5 space-y-4"
        >
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground-500 uppercase tracking-wider">
              Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. SharePoint Contracts"
              className="w-full px-3 py-2 rounded-lg bg-background border border-neutral-200 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground-500 uppercase tracking-wider">
              Realm
            </label>
            <select
              value={realmId}
              onChange={(e) => setRealmId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-neutral-200 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/40"
            >
              <option value="">Select realm…</option>
              {realms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground-500 uppercase tracking-wider">
              Source type
            </label>
            <div className="grid grid-cols-3 gap-2">
              {sourceTypeOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSourceType(opt.value)}
                  className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border text-center transition-colors ${
                    sourceType === opt.value
                      ? "border-primary-500 bg-primary-50"
                      : "border-neutral-200 bg-background hover:border-primary-400 hover:bg-background-200/40"
                  }`}
                >
                  {opt.icon}
                  <span
                    className={`text-xs font-medium leading-tight ${sourceType === opt.value ? "text-primary-600" : "text-foreground"}`}
                  >
                    {opt.label}
                  </span>
                  <span className="text-[10px] text-foreground-500 leading-tight">
                    {opt.description}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {sourceType === "files" && !doclingConfigured && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-warning-50 border border-warning-200">
              <AlertTriangle
                size={14}
                className="text-warning-500 mt-0.5 shrink-0"
              />
              <p className="text-xs text-warning-700">
                PDF and DOCX files require Docling to be configured. Plain text
                (.txt, .md) files can be indexed without Docling.
              </p>
            </div>
          )}

          {sourceType === "url" && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground-500 uppercase tracking-wider">
                URLs{" "}
                <span className="normal-case font-normal text-foreground-400">
                  (one per line)
                </span>
              </label>
              <textarea
                value={urls}
                onChange={(e) => setUrls(e.target.value)}
                placeholder={"https://example.com/docs\nhttps://example.com/policy"}
                rows={4}
                className="w-full px-3 py-2 rounded-lg bg-background border border-neutral-200 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40 font-mono"
              />
            </div>
          )}

          {sourceType === "text" && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground-500 uppercase tracking-wider">
                  Document title
                </label>
                <input
                  value={textTitle}
                  onChange={(e) => setTextTitle(e.target.value)}
                  placeholder="e.g. Company Policy v2"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-neutral-200 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground-500 uppercase tracking-wider">
                  Content
                </label>
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  placeholder="Paste document content here…"
                  rows={5}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-neutral-200 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                />
              </div>
            </div>
          )}

          {sourceType === "files" && (
            <FileDropzone
              files={selectedFiles}
              onAdd={handleAddFiles}
              onRemove={(index) =>
                setSelectedFiles((prev) => prev.filter((_, i) => i !== index))
              }
            />
          )}

          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-1 text-xs text-foreground-500 hover:text-foreground transition-colors"
            >
              {showAdvanced ? (
                <ChevronUp size={14} />
              ) : (
                <ChevronDown size={14} />
              )}
              Advanced settings
            </button>
            {showAdvanced && (
              <div className="mt-3 space-y-1">
                <label className="text-xs font-medium text-foreground-500 uppercase tracking-wider">
                  Chunk size{" "}
                  <span className="normal-case font-normal text-foreground-400">
                    (chars)
                  </span>
                </label>
                <input
                  type="number"
                  value={chunkSize}
                  onChange={(e) => setChunkSize(e.target.value)}
                  min={100}
                  max={8000}
                  className="w-32 px-3 py-2 rounded-lg bg-background border border-neutral-200 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                />
                <p className="text-xs text-foreground-400">
                  Default 1000. Larger = more context per chunk, fewer results.
                </p>
              </div>
            )}
          </div>

          {uploadProgress && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-primary-50 border border-primary-200">
              <Loader2
                size={14}
                className="animate-spin text-primary-500 shrink-0"
              />
              <p className="text-xs text-primary-700">{uploadProgress}</p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-danger-50 border border-danger-200">
              <AlertTriangle
                size={14}
                className="text-danger-500 mt-0.5 shrink-0"
              />
              <p className="text-xs text-danger-600">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-neutral-200 text-sm text-foreground-500 hover:text-foreground hover:border-foreground-500 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {sourceType === "files" ? "Upload & create" : "Create source"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KnowledgeTab
// ---------------------------------------------------------------------------

export function KnowledgeTab({
  did,
  online,
  capabilities,
}: {
  did: string;
  agentName: string;
  online: boolean;
  capabilities: string[];
}) {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [realms, setRealms] = useState<KsRealmOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [doclingConfigured, setDoclingConfigured] = useState(false);
  const [granting, setGranting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeSource | null>(
    null
  );

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ksRes, rlRes] = await Promise.all([
        fetch(`/api/knowledge?agentDid=${encodeURIComponent(did)}`),
        fetch("/api/realms"),
      ]);
      const ksData = (await ksRes.json()) as { sources?: KnowledgeSource[] };
      const rlData = (await rlRes.json()) as { realms?: KsRealmOption[] };
      setSources(ksData.sources ?? []);
      setRealms(rlData.realms ?? []);
    } finally {
      setLoading(false);
    }
  }, [did]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/settings/docling")
      .then((r) => r.json())
      .then((d: { configured?: boolean; url?: string }) => {
        setDoclingConfigured(d.configured === true || Boolean(d.url));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!sources.some((s) => s.status === "syncing")) return;
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [sources, load]);

  async function handleSync(source: KnowledgeSource) {
    if (!online) {
      showToast("Agent is offline — cannot sync", false);
      return;
    }
    setSyncingIds((s) => new Set(s).add(source.id));
    try {
      const res = await fetch(`/api/knowledge/${source.id}/sync`, {
        method: "POST",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      showToast(`Sync started for "${source.name}"`);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Sync failed", false);
    } finally {
      setSyncingIds((s) => {
        const n = new Set(s);
        n.delete(source.id);
        return n;
      });
    }
  }

  async function executeDelete(source: KnowledgeSource) {
    setDeletingIds((s) => new Set(s).add(source.id));
    try {
      const res = await fetch(`/api/knowledge/${source.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      showToast(`"${source.name}" deleted`);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Delete failed", false);
    } finally {
      setDeletingIds((s) => {
        const n = new Set(s);
        n.delete(source.id);
        return n;
      });
    }
  }

  async function handleGrantKnowledgeSearch() {
    setGranting(true);
    try {
      const policiesRes = await fetch(
        `/api/policies?agentDid=${encodeURIComponent(did)}`
      );
      const policiesData = (await policiesRes.json()) as {
        policies?: Array<{
          id: string;
          capabilities: string[];
          resourceLimits: Record<string, unknown> | null;
          expiresAt: string | null;
          createdAt: string;
        }>;
      };
      const activePolicies = (policiesData.policies ?? [])
        .filter((p) => !p.expiresAt || new Date(p.expiresAt) > new Date())
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      const latestPolicy = activePolicies[0] ?? null;

      const baseCaps: string[] = latestPolicy?.capabilities ?? [
        ...capabilities,
      ];
      const newCaps = baseCaps.includes("knowledge_search")
        ? baseCaps
        : [...baseCaps, "knowledge_search"];

      if (latestPolicy) {
        await fetch(`/api/policies/${encodeURIComponent(latestPolicy.id)}`, {
          method: "DELETE",
        });
      }

      const createRes = await fetch("/api/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentDid: did,
          capabilities: newCaps,
          resourceLimits: latestPolicy?.resourceLimits ?? undefined,
        }),
      });
      if (!createRes.ok) {
        const err = (await createRes.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(err.error ?? `HTTP ${createRes.status}`);
      }

      showToast("knowledge_search granted — new policy applied");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to grant capability",
        false
      );
    } finally {
      setGranting(false);
    }
  }

  const getRealmName = (id: string) =>
    realms.find((r) => r.id === id)?.name ?? id;
  const totalChunks = sources.reduce((sum, s) => sum + (s.chunk_count ?? 0), 0);
  const readyCount = sources.filter((s) => s.status === "ready").length;
  const hasFileSources = sources.some((s) => s.source_type === "files");
  const hasReadySources = readyCount > 0;
  const hasKnowledgeCapability = capabilities.includes("knowledge_search");

  return (
    <div className="space-y-5">
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium text-white ${toast.ok ? "bg-success-600" : "bg-danger-600"}`}
        >
          {toast.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {toast.msg}
        </div>
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        title="Delete knowledge source"
        message={
          deleteTarget
            ? syncingIds.has(deleteTarget.id) ||
              deleteTarget.status === "syncing"
              ? `"${deleteTarget.name}" is currently syncing.\nDelete it anyway? The in-progress sync will be abandoned.`
              : `Delete "${deleteTarget.name}"?\nAll indexed chunks will be removed from this agent.`
            : ""
        }
        confirmLabel="Delete"
        variant="danger"
        onConfirm={async () => {
          const src = deleteTarget;
          setDeleteTarget(null);
          if (src) await executeDelete(src);
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              Knowledge Sources
            </h3>
            {hasFileSources && (
              <span
                title={
                  doclingConfigured
                    ? "Docling configured — PDF/DOCX parsing enabled"
                    : "Docling not configured — PDF/DOCX parsing unavailable"
                }
                className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${
                  doclingConfigured
                    ? "bg-success-100 text-success-700 border-success-300"
                    : "bg-warning-100 text-warning-700 border-warning-300"
                }`}
              >
                <FileType2 size={10} />
                {doclingConfigured ? "Docling on" : "Docling off"}
              </span>
            )}
          </div>
          <p className="text-xs text-foreground-500 mt-0.5">
            {sources.length === 0
              ? "No sources yet — add one to enable RAG search"
              : `${readyCount}/${sources.length} ready · ${totalChunks.toLocaleString()} chunks indexed`}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add source
        </button>
      </div>

      {!online && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-warning-50 border border-warning-200 text-xs text-warning-700">
          <WifiOff size={14} className="shrink-0" />
          Agent is offline. You can manage sources but syncing requires the
          agent to be connected.
        </div>
      )}

      {hasReadySources && !hasKnowledgeCapability && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-warning-50 border border-warning-200">
          <AlertTriangle
            size={16}
            className="shrink-0 mt-0.5 text-warning-600"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-warning-800">
              Knowledge sources are ready but the agent cannot use them
            </p>
            <p className="text-xs text-warning-700 mt-1">
              The{" "}
              <code className="bg-warning-100 px-1 rounded font-mono">
                knowledge_search
              </code>{" "}
              capability is not granted in this agent&apos;s active policy.
            </p>
            <p className="text-xs text-warning-600 mt-1">
              Granting this capability will create a new policy (replacing the
              current one) and immediately reissue the agent&apos;s certificate.
            </p>
          </div>
          <button
            onClick={handleGrantKnowledgeSearch}
            disabled={granting}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-warning-600 hover:bg-warning-500 disabled:opacity-60 text-white text-xs font-medium transition-colors"
          >
            {granting ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <ShieldCheck size={13} />
            )}
            {granting ? "Applying…" : "Grant capability"}
          </button>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-foreground-500">
          <Loader2 size={16} className="animate-spin" /> Loading…
        </div>
      )}

      {!loading && sources.length === 0 && (
        <div className="rounded-2xl border border-neutral-200 border-dashed bg-background/40 p-10 text-center space-y-3">
          <BookOpen className="w-7 h-7 text-foreground-400 mx-auto" />
          <p className="text-sm font-medium text-foreground">
            No knowledge sources yet
          </p>
          <p className="text-xs text-foreground-500 max-w-sm mx-auto">
            Connect URLs, paste inline text, or upload documents. Once synced
            and the{" "}
            <code className="bg-background-200 px-1 rounded text-primary-400">
              knowledge_search
            </code>{" "}
            capability is granted, the agent will use indexed content in every
            conversation.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors"
          >
            Add first source
          </button>
        </div>
      )}

      {!loading && sources.length > 0 && (
        <div className="space-y-3">
          {sources.map((source) => (
            <KsSourceCard
              key={source.id}
              source={source}
              realmName={getRealmName(source.realm_id)}
              isSyncing={
                syncingIds.has(source.id) || source.status === "syncing"
              }
              isDeleting={deletingIds.has(source.id)}
              isExpanded={expandedId === source.id}
              online={online}
              onToggleExpand={() =>
                setExpandedId(expandedId === source.id ? null : source.id)
              }
              onSync={() => handleSync(source)}
              onDelete={() => setDeleteTarget(source)}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <KsAddSourceModal
          did={did}
          realms={realms}
          doclingConfigured={doclingConfigured}
          onClose={() => setShowCreate(false)}
          onCreated={load}
        />
      )}
    </div>
  );
}
