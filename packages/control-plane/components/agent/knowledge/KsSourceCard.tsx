import { useState } from "react";
import {
  Loader2,
  RefreshCw,
  Trash2,
  Globe,
  Globe2,
  FileText,
  FileType2,
  Layers,
  File,
  XCircle,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import {
  adminApi,
  unwrap,
} from "@/lib/api/ts-rest/client";
import { KsStatusBadge } from "./KsStatusBadge";
import { mimeIcon } from "./utils";
import type { KnowledgeFile } from "./types";
import { KnowledgeSource } from "@prisma/client";
import { JsonObject } from "@prisma/client/runtime/client";
import { formatBytes, timeAgo } from "@vaultysclaw/shared";

interface KsSourceCardProps {
  source: KnowledgeSource;
  workspaceName: string;
  isSyncing: boolean;
  isDeleting: boolean;
  isExpanded: boolean;
  online: boolean;
  onToggleExpand: () => void;
  onSync: () => void;
  onDelete: () => void;
}

export function KsSourceCard({
  source,
  workspaceName,
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
  const config = source.config as JsonObject;

  const typeIconMap: Record<string, React.ReactNode> = {
    url: <Globe size={16} className="text-primary-400" />,
    text: <FileText size={16} className="text-warning-400" />,
    files: <FileType2 size={16} className="text-success-400" />,
  };
  const typeIcon = typeIconMap[source.sourceType] ?? (
    <File size={16} className="text-foreground-400" />
  );

  async function loadFiles() {
    if (files !== null || source.sourceType !== "files") return;
    setLoadingFiles(true);
    try {
      const { files: loaded } = unwrap(
        await adminApi.knowledge.listFiles({ query: { sourceId: source.id } })
      );
      setFiles(loaded);
    } catch {
      setFiles([]);
    } finally {
      setLoadingFiles(false);
    }
  }

  function handleExpand() {
    if (!isExpanded && source.sourceType === "files") {
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
            <span>{workspaceName}</span>
            <span className="text-foreground-400">·</span>
            <Layers size={11} className="shrink-0" />
            <span>
              {source.chunkCount > 0
                ? `${source.chunkCount.toLocaleString()} chunks`
                : "No chunks yet"}
            </span>
            <span className="text-foreground-400">·</span>
            <span>{timeAgo(source.lastSyncedAt?.toString() ?? "")}</span>
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

          {source.sourceType === "url" && Array.isArray(config.urls) && (
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

          {source.sourceType === "text" && Array.isArray(config.texts) && (
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

          {source.sourceType === "files" && (
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
                      {mimeIcon(f.mimeType)}
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
                {new Date(source.createdAt).toLocaleDateString()}
              </span>
            </span>
            <span>
              ID: <span className="text-foreground font-mono">{source.id}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
