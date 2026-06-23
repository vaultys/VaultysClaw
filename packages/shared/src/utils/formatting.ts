/**
 * Formatting utilities for time, uptime, duration, and display values.
 * Shared across agent-controller web/TUI and control-plane UI.
 */

import { crypto, VaultysId } from "@vaultys/id";
import { VaultysIDInfo } from "../types";

/**
 * Format uptime in seconds to human-readable format (e.g., "2h 30m")
 */
export function fmtUptime(seconds: number): string {
  return fmtDuration(seconds * 1000);
}

export function daysFromNow(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  // datetime-local expects "YYYY-MM-DDTHH:MM" in local time
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Format ISO8601 timestamp to HH:MM:SS time only
 */
export function formatTimeOnly(dateString: string): string {
  return dateString.slice(11, 19);
}

/**
 * Format ISO8601 timestamp to readable date (e.g., "May 28, 2026").
 * Naive timestamps (no trailing "Z") are treated as UTC via {@link parseUTC}.
 */
export function formatDate(dateString: string): string {
  return parseUTC(dateString).toLocaleDateString();
}

/**
 * Format milliseconds to human-readable duration
 */
export function fmtDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

/**
 * Extract initials from a name (e.g., "John Doe" → "JD")
 */
export function getInitials(name: string): string {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?"
  );
}

/**
 * Format DID for display (truncate long DIDs with ellipsis)
 */
export function shortDid(did?: string): string {
  if (!did) return "Unknown";
  const parts = did.split(":");
  const last = parts[parts.length - 1];
  return last.length > 16 ? `…${last.slice(-12)}` : last;
}

/**
 * Format bytes to human-readable size (e.g., "1.5MB")
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + sizes[i];
}

/**
 * Format number with thousands separator
 */
export function formatNumber(num: number): string {
  return num.toLocaleString();
}

export function formatCompactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/**
 * Parse ISO8601 timestamp to UTC Date
 */
export function parseUTC(iso: string): Date {
  return new Date(iso.endsWith("Z") ? iso : iso + "Z");
}

/**
 * Format ISO8601 timestamp to relative time (e.g., "5m ago", "2h ago"), or "—" if null
 */
export function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const seconds = Math.floor((Date.now() - parseUTC(iso).getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Format ISO8601 timestamp to human-readable date and time (e.g., "May 28, 2026, 2:30 PM"), or "—" if null
 */
export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const date = parseUTC(iso);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Extract displayable VaultysId info from a public key buffer.
 */
export function vaultysIdInfo(pk: unknown): VaultysIDInfo | null {
  if (!pk) return null;
  try {
    const vid = VaultysId.fromId(pk as crypto.Buffer).toVersion(1);
    return {
      did: vid.did,
      fingerprint: vid.fingerprint,
      version: vid.version,
      type: vid.isMachine()
        ? "machine"
        : vid.isPerson()
          ? "person"
          : vid.isHardware()
            ? "hardware"
            : "unknown",
    };
  } catch {
    return null;
  }
}
