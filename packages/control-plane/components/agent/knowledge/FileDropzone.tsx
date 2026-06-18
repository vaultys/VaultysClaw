import { useRef, useState } from "react";
import { Upload, File, X } from "lucide-react";
import { formatBytes } from "./utils";

interface FileDropzoneProps {
  files: File[];
  onAdd: (added: File[]) => void;
  onRemove: (index: number) => void;
}

export function FileDropzone({ files, onAdd, onRemove }: FileDropzoneProps) {
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
        className={`flex flex-col items-center justify-center gap-2 px-4 py-8 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${dragging
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
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${oversized
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
