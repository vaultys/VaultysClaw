"use client";

import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import type { UserConnectionPhase } from "@/hooks/useVaultysConnect";
import type { WalletSecurityType } from "@/lib/browser-connect";
import SecurityTypeSelector from "./SecurityTypeSelector";

interface QRCodeScreenProps {
  /** QR / deep-link URL to display (classic deep-link or P2P wallet URL). */
  readonly qrUrl?: string;
  readonly phase?: UserConnectionPhase;
  readonly title?: string;
  readonly subtitle?: string;
  readonly successMessage?: string;
  /** When true, show a "Copy deep link" button. */
  readonly showCopy?: boolean;
  /** Optional — render a "Connect via P2P instead" button when provided. */
  readonly onSwitchP2P?: () => void;
  /** Whether the dev "connect without app" option is enabled. */
  readonly devEnabled?: boolean;
  /** Dev option handler — performs the browser-direct SRP. */
  readonly onConnectWithoutApp?: (securityType: WalletSecurityType) => void;
  /** True while the browser-direct SRP is running. */
  readonly devConnecting?: boolean;
  readonly onRetry: () => void;
}

export default function QRCodeScreen({
  qrUrl,
  phase,
  title = "Scan with VaultysID",
  subtitle = "Open your VaultysID app and scan the QR code below",
  successMessage = "Authenticated! Redirecting…",
  showCopy = true,
  onSwitchP2P,
  devEnabled = false,
  onConnectWithoutApp,
  devConnecting = false,
  onRetry,
}: QRCodeScreenProps) {
  const [copied, setCopied] = useState(false);
  const [devSelecting, setDevSelecting] = useState(false);

  const copyLink = () => {
    if (!qrUrl) return;
    navigator.clipboard.writeText(qrUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (phase === "failure") {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="w-16 h-16 rounded-full bg-danger-100 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-danger-500"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
        <div>
          <p className="text-foreground font-semibold">Connection failed</p>
          <p className="text-foreground-500 text-sm mt-1">
            The request timed out or was rejected.
          </p>
        </div>
        <button
          onClick={() => {
            setDevSelecting(false);
            onRetry();
          }}
          className="px-5 py-2 bg-background-200 hover:bg-neutral-300 text-foreground rounded-lg transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  if (phase === "success") {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="w-16 h-16 rounded-full bg-success-100 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-success-600"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <p className="text-foreground font-semibold">{successMessage}</p>
      </div>
    );
  }

  // Dev mode — browser-direct connection in progress
  if (devConnecting) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-foreground font-semibold">
          Connecting via this browser…
        </p>
        <p className="text-foreground-500 text-sm">
          Authenticating with a key stored in this browser.
        </p>
      </div>
    );
  }

  // Dev mode — choosing the security type for the browser identity
  if (devSelecting && onConnectWithoutApp) {
    return (
      <div className="flex flex-col gap-4">
        <SecurityTypeSelector
          onSelect={(type) => {
            setDevSelecting(false);
            onConnectWithoutApp(type);
          }}
        />
        <button
          onClick={() => setDevSelecting(false)}
          className="px-4 py-2 text-foreground-500 hover:text-foreground-700 text-sm transition-colors"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        <p className="text-foreground-500 text-sm mt-1">{subtitle}</p>
      </div>

      <div className="flex justify-center">
        {qrUrl ? (
          <div className="bg-white p-4 rounded-xl">
            <QRCodeSVG value={qrUrl} size={200} />
          </div>
        ) : (
          <div className="w-52 h-52 bg-background-200 rounded-xl flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {phase === "waiting" && (
        <div className="flex items-center justify-center gap-2 text-foreground-500 text-sm">
          <div className="w-3 h-3 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
          Waiting for scan…
        </div>
      )}

      <div className="flex flex-col gap-2">
        {showCopy && (
          <button
            onClick={copyLink}
            disabled={!qrUrl}
            className="px-4 py-2 bg-background-200 hover:bg-neutral-300 text-foreground-700 rounded-lg text-sm transition-colors disabled:opacity-40"
          >
            {copied ? "Copied!" : "Copy deep link"}
          </button>
        )}
        {onSwitchP2P && (
          <button
            onClick={onSwitchP2P}
            className="px-4 py-2 text-foreground-500 hover:text-foreground-700 text-sm transition-colors"
          >
            Connect via P2P instead
          </button>
        )}
        {devEnabled && onConnectWithoutApp && (
          <button
            onClick={() => setDevSelecting(true)}
            className="px-4 py-2 text-foreground-500 hover:text-foreground-700 text-sm transition-colors"
          >
            Connect without the app (dev mode)
          </button>
        )}
      </div>
    </div>
  );
}
