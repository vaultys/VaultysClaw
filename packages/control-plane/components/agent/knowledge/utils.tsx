import { FileType2, FileText, Layers, File } from "lucide-react";

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
