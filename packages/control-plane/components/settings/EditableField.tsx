import { useState, useEffect } from "react";
import { Check, Edit2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function EditableField({
  label,
  value,
  placeholder,
  textarea,
  maxLength,
  onSave,
}: {
  label: string;
  value: string;
  placeholder?: string;
  textarea?: boolean;
  maxLength?: number;
  onSave: (v: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="py-2.5 border-b border-neutral-200/60 last:border-0">
        <label className="text-xs text-foreground-400 uppercase tracking-wider font-medium block mb-1.5">
          {label}
        </label>
        <form onSubmit={submit} className="flex flex-col gap-2">
          {textarea ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              maxLength={maxLength}
              placeholder={placeholder}
              className="w-full bg-background-200 border border-neutral-300 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 resize-none"
            />
          ) : (
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={maxLength}
              placeholder={placeholder}
              autoFocus
              className="w-full bg-background-200 border border-neutral-300 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
            />
          )}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-40 transition"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft(value);
              }}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-background-200 border border-neutral-300 hover:border-foreground-500 text-foreground transition flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Cancel
            </button>
            {status === "error" && (
              <span className="text-xs text-danger-600">Save failed</span>
            )}
          </div>
          {maxLength && (
            <p className="text-[10px] text-foreground-400 text-right">
              {draft.length}/{maxLength}
            </p>
          )}
        </form>
      </div>
    );
  }

  return (
    <div className="flex justify-between items-start gap-4 py-2.5 border-b border-neutral-200/60 last:border-0 group">
      <span className="text-xs text-foreground-400 uppercase tracking-wider font-medium shrink-0 pt-0.5">
        {label}
      </span>
      <div className="flex items-start gap-2 min-w-0">
        <span
          className={cn(
            "text-sm text-right break-all",
            !value && "text-foreground-400 italic"
          )}
        >
          {value || placeholder || "—"}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {status === "saved" && (
            <Check className="w-3.5 h-3.5 text-success-500" />
          )}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="opacity-0 group-hover:opacity-100 text-foreground-400 hover:text-foreground transition"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
