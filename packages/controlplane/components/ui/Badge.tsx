import type { ReactNode } from "react";

/**
 * The one badge in the console. Quiet by design: a hairline box with neutral text, and colour only
 * as a small dot when the badge states something an operator should notice — a certificate that is
 * active or revoked, a queue that is waiting, a kind that enforces. Status pills tinted in every
 * hue read as noise; one dot per badge keeps the meaning and lets the content carry the colour.
 */
export type BadgeTone = "neutral" | "positive" | "negative" | "caution" | "attention" | "muted";

const DOT: Record<BadgeTone, string | null> = {
  neutral: null,
  positive: "bg-success-600",
  negative: "bg-danger-600",
  caution: "bg-warning-500",
  attention: "bg-primary-600",
  muted: "bg-neutral-400",
};

export function Badge({
  tone = "neutral",
  mono = false,
  className = "",
  title,
  children,
}: {
  tone?: BadgeTone;
  /** Set for machine values — event types, capability names, schemes. */
  mono?: boolean;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  const dot = DOT[tone] ?? null;
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded border border-neutral-200 bg-background-100 px-1.5 py-0.5 text-xs leading-4 ${
        tone === "muted" ? "text-foreground-500" : "text-foreground-700"
      } ${mono ? "font-mono" : ""} ${className}`}
    >
      {dot && <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
      {children}
    </span>
  );
}

/** Certificate / status-check states (`CertificateStatus` plus anything else a status column may
 *  hold) mapped once, so every list and detail page says the same thing in the same way. */
export function statusTone(status: string): BadgeTone {
  switch (status) {
    case "active":
    case "valid":
    case "signed":
    case "granted":
    case "connected":
    case "online":
    case "managed":
    case "healthy":
    case "ok":
      return "positive";
    case "revoked":
    case "invalid":
    case "failed":
    case "denied":
    case "error":
    case "unreachable":
      return "negative";
    case "pending":
    case "shadow":
    case "warning":
      return "caution";
    default:
      return "muted";
  }
}
