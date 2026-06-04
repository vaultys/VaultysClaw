"use client";

import { AlertTriangle, X } from "lucide-react";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-background-100 border border-neutral-200 rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            {variant === "danger" && (
              <AlertTriangle size={15} className="text-danger-500" />
            )}
            {title}
          </span>
          <button
            onClick={onCancel}
            className="text-foreground-400 hover:text-foreground p-1 rounded-lg hover:bg-background-200 transition-colors"
          >
            <X size={15} />
          </button>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-foreground-500 whitespace-pre-line">
            {message}
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-neutral-200">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-3 py-1.5 text-sm text-foreground-500 hover:text-foreground border border-neutral-200 rounded-lg hover:bg-background-200 transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg text-white transition-colors disabled:opacity-50 ${
              variant === "danger"
                ? "bg-danger-600 hover:bg-danger-500"
                : "bg-primary-600 hover:bg-primary-500"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
