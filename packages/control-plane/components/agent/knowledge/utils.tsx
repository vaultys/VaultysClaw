import { FileType2, FileText, Layers, File } from "lucide-react";

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function relativeTime(isoString: string | null): string {
  if (!isoString) return "Never";
  const iso = isoString;
  const d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export function mimeIcon(mime: string): React.ReactNode {
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
