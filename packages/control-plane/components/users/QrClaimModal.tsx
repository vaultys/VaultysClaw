"use client";

import { X, Loader2, CheckCircle, XCircle } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

export type QrPhase = "showing" | "success" | "failure";

export function QrClaimModal({
  subtitle,
  qrUrl,
  phase,
  onClose,
  onRetry,
}: {
  subtitle: string;
  qrUrl: string;
  phase: QrPhase;
  onClose: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-background-100 border border-neutral-200 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-foreground">Claim Account</h3>
            <p className="text-xs text-foreground-500 mt-0.5">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-foreground-500 hover:text-foreground hover:bg-background-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {phase === "showing" && (
          <>
            <p className="text-xs text-foreground-500 text-center">
              Scan this QR code with the Vaultys wallet to activate the account.
            </p>
            <div className="flex justify-center p-4 bg-background rounded-xl">
              <QRCodeSVG value={qrUrl} size={200} />
            </div>
            <div className="flex items-center gap-2 text-xs text-foreground-400">
              <Loader2 className="w-3 h-3 animate-spin shrink-0" />
              Waiting for wallet scan…
            </div>
          </>
        )}

        {phase === "success" && (
          <div className="flex flex-col items-center gap-3 py-4">
            <CheckCircle className="w-12 h-12 text-success-500" />
            <p className="text-sm font-medium text-foreground">
              Account claimed successfully!
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Done
            </button>
          </div>
        )}

        {phase === "failure" && (
          <div className="flex flex-col items-center gap-3 py-4">
            <XCircle className="w-12 h-12 text-danger-500" />
            <p className="text-sm font-medium text-foreground">
              QR code expired or failed.
            </p>
            <button
              onClick={onRetry}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
