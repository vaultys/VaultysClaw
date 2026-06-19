import { useState } from "react";
import {
  Loader2,
  BookOpen,
  AlertTriangle,
  Globe,
  FileText,
  FileType2,
  ChevronUp,
  ChevronDown,
  X,
} from "lucide-react";
import { knowledgeClient, unwrap } from "@/lib/api/ts-rest/client";
import { FileDropzone } from "./FileDropzone";
import type { KsRealmOption, KsSourceType } from "./types";

interface KsAddSourceModalProps {
  did: string;
  realms: KsRealmOption[];
  doclingConfigured: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function KsAddSourceModal({
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
      const parsedChunkSize = parseInt(chunkSize, 10) || 1000;

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
        unwrap(
          await knowledgeClient.create({
            body: {
              realmId,
              agentDid: did,
              name: name.trim(),
              sourceType: "url",
              config: { chunkSize: parsedChunkSize, urls: list },
            },
          })
        );
      } else if (sourceType === "text") {
        if (!textTitle.trim() || !textContent.trim()) {
          setError("Title and content are required for text sources.");
          setSaving(false);
          return;
        }
        unwrap(
          await knowledgeClient.create({
            body: {
              realmId,
              agentDid: did,
              name: name.trim(),
              sourceType: "text",
              config: {
                chunkSize: parsedChunkSize,
                texts: [
                  { title: textTitle.trim(), content: textContent.trim() },
                ],
              },
            },
          })
        );
      } else {
        if (!selectedFiles.length) {
          setError("Select at least one file to upload.");
          setSaving(false);
          return;
        }
        const { source } = unwrap(
          await knowledgeClient.create({
            body: {
              realmId,
              agentDid: did,
              name: name.trim(),
              sourceType: "files",
              config: { chunkSize: parsedChunkSize },
            },
          })
        );
        // Multipart uploads stay on raw fetch (see /api/knowledge/files route).
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
                  className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border text-center transition-colors ${sourceType === opt.value
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
