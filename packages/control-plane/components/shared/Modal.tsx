import { ReactNode } from "react";
import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  showCloseButton?: boolean;
}

export function Modal({
  isOpen,
  title,
  onClose,
  children,
  className = "",
  showCloseButton = true,
}: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Content */}
      <div
        className={`relative bg-canvas rounded-lg border border-border shadow-lg max-w-md w-full mx-4 ${className}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-muted">
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          {showCloseButton && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-canvas-overlay rounded-md transition-colors"
              aria-label="Close modal"
            >
              <X size={18} className="text-fg-muted" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
