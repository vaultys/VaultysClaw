"use client";

import { cn } from "@/lib/utils";
import { Eye, EyeOff, Check, AlertCircle, Loader2, X } from "lucide-react";
import { useState } from "react";

// ─── Field Component ──────────────────────────────────────────────────

export function Field({
  label,
  id,
  type = "text",
  value,
  onChange,
  placeholder,
  disabled,
  showToggle,
  error,
}: {
  label: string;
  id: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  showToggle?: boolean;
  error?: string;
}) {
  const [show, setShow] = useState(false);
  const inputType = showToggle ? (show ? "text" : "password") : type;
  return (
    <div>
      <label
        htmlFor={id}
        className="text-xs text-foreground-400 uppercase tracking-wider font-medium block mb-1.5"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            "w-full bg-background-200 border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 disabled:opacity-50 transition pr-9",
            error ? "border-danger-300" : "border-neutral-300"
          )}
        />
        {showToggle && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-foreground-400 hover:text-foreground transition"
          >
            {show ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        )}
      </div>
      {error && (
        <p className="text-xs text-danger-600 mt-1.5">{error}</p>
      )}
    </div>
  );
}

// ─── Status Badge ───────────────────────────────────────────────────

export function StatusBadge({
  status,
  message,
}: {
  status: "success" | "error" | "warning" | "idle" | "loading";
  message?: string;
}) {
  const baseClass =
    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium";

  if (status === "success") {
    return (
      <div className={cn(baseClass, "bg-success-100 text-success-700")}>
        <Check className="w-3 h-3" />
        {message || "Success"}
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className={cn(baseClass, "bg-danger-100 text-danger-700")}>
        <AlertCircle className="w-3 h-3" />
        {message || "Error"}
      </div>
    );
  }
  if (status === "loading") {
    return (
      <div className={cn(baseClass, "bg-neutral-100 text-neutral-700")}>
        <Loader2 className="w-3 h-3 animate-spin" />
        {message || "Loading..."}
      </div>
    );
  }
  if (status === "warning") {
    return (
      <div className={cn(baseClass, "bg-warning-100 text-warning-700")}>
        <AlertCircle className="w-3 h-3" />
        {message || "Warning"}
      </div>
    );
  }
  return null;
}

// ─── Integration Section Header ──────────────────────────────────────

export function IntegrationHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="px-5 py-4 border-b border-neutral-200 flex items-center gap-2">
      <Icon className="w-4 h-4 text-foreground-500" />
      <div className="flex-1">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <span className="text-xs text-foreground-400">{description}</span>
    </div>
  );
}

// ─── Integration Panel ───────────────────────────────────────────────

export function IntegrationPanel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "bg-background-100 border border-neutral-200 rounded-xl overflow-hidden",
        className
      )}
    >
      {children}
    </section>
  );
}

// ─── Modal Component ────────────────────────────────────────────────

export function IntegrationModal({
  isOpen,
  onClose,
  title,
  children,
  onSave,
  isSaving,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  onSave?: () => void;
  isSaving?: boolean;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-background-100 rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-foreground-500 hover:text-foreground hover:bg-background-200 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-4">{children}</div>

        {/* Footer */}
        {onSave && (
          <div className="px-6 py-4 border-t border-neutral-200 flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-medium rounded-lg bg-background-200 border border-neutral-300 hover:border-foreground-500 text-foreground transition"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={isSaving}
              className="px-4 py-1.5 text-xs font-medium rounded-lg bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-40 transition flex items-center gap-1.5"
            >
              {isSaving && <Loader2 className="w-3 h-3 animate-spin" />}
              Save
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
