"use client";

import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import type {
  UserConnectionPhase,
  UserConnectInfo,
} from "@/hooks/useVaultysConnect";

interface QRCodeScreenProps {
  readonly connectInfo?: UserConnectInfo;
  readonly phase?: UserConnectionPhase;
  readonly p2pUrl?: string; // full wallet:// URL for P2P QR code
  readonly onSwitchP2P: () => void;
  readonly onRetry: () => void;
}

export default function QRCodeScreen({
  connectInfo,
  phase,
  p2pUrl,
  onSwitchP2P,
  onRetry,
}: QRCodeScreenProps) {
  const [copied, setCopied] = useState(false);

  const copyLink = () => {
    if (!connectInfo?.url) return;
    navigator.clipboard.writeText(connectInfo.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (phase === "failure") {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="w-16 h-16 rounded-full bg-danger-100 dark:bg-danger-900/40 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-danger-500 dark:text-danger-400"
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
          onClick={onRetry}
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
        <div className="w-16 h-16 rounded-full bg-success-100 dark:bg-success-900/40 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-success-600 dark:text-success-400"
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
        <p className="text-foreground font-semibold">
          Authenticated! Redirecting…
        </p>
      </div>
    );
  }

  // P2P mode — show a QR code the wallet can scan
  if (p2pUrl) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <div>
          <h2 className="text-xl font-semibold text-foreground">
            P2P Connection
          </h2>
          <p className="text-foreground-500 text-sm mt-1">
            Scan with your VaultysID wallet to connect directly
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl">
          <QRCodeSVG value={p2pUrl} size={200} />
        </div>

        <div className="flex items-center gap-2 text-foreground-500 text-sm">
          <div className="w-3 h-3 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
          Waiting for wallet to connect…
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground">
          Scan with VaultysID
        </h2>
        <p className="text-foreground-500 text-sm mt-1">
          Open your VaultysID app and scan the QR code below
        </p>
      </div>

      <div className="flex justify-center">
        {connectInfo?.url ? (
          <div className="bg-white p-4 rounded-xl">
            <QRCodeSVG value={connectInfo.url} size={200} />
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
        <button
          onClick={copyLink}
          disabled={!connectInfo?.url}
          className="px-4 py-2 bg-background-200 hover:bg-neutral-300 text-foreground-700 rounded-lg text-sm transition-colors disabled:opacity-40"
        >
          {copied ? "Copied!" : "Copy deep link"}
        </button>
        <button
          onClick={onSwitchP2P}
          className="px-4 py-2 text-foreground-500 hover:text-foreground-700 text-sm transition-colors"
        >
          Connect via P2P instead
        </button>
      </div>
    </div>
  );
}
