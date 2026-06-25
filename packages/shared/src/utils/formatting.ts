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

export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0m";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
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
 * Format the elapsed time between two instants (defaulting `end` to now).
 * Accepts ISO strings or Date objects; naive strings are treated as UTC.
 */
export function durationBetween(
  start: Date | string,
  end: Date | string | null
): string {
  const s = start instanceof Date ? start : parseUTC(start);
  const e = end ? (end instanceof Date ? end : parseUTC(end)) : new Date();
  return fmtDuration(e.getTime() - s.getTime());
}

/**
 * Format a number as a USD cost (e.g. 1.5 → "$1.50")
 */
export function formatCost(n: number, fractionDigits = 2): string {
  return `$${n.toFixed(fractionDigits)}`;
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

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
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
export function timeAgo(iso: string | Date | null): string {
  if (iso instanceof Date) iso = iso.toISOString();
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
export function formatDateTime(iso: string | Date | null): string {
  if (!iso) return "—";
  if (iso instanceof Date) iso = iso.toISOString();
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

export function greeting(name: string | null | undefined): string {
  const hour = new Date().getHours();
  const first = name?.split(" ")[0] ?? "there";
  if (hour < 12) return `Good morning, ${first}`;
  if (hour < 18) return `Good afternoon, ${first}`;
  return `Good evening, ${first}`;
}

export function parseTimestamp(val: unknown): number | null {
  if (val === null || val === undefined || val === "" || val === false)
    return null;
  if (typeof val === "number") return val > 0 ? val * 1000 : null;
  if (typeof val === "string") {
    if (!val.trim()) return null;
    if (/^\d+$/.test(val)) {
      const n = parseInt(val, 10);
      return n > 0 ? n * 1000 : null;
    }
    let s = val.replace(" ", "T");
    if (!s.endsWith("Z") && !s.includes("+") && !/[+-]\d{2}:\d{2}$/.test(s))
      s += "Z";
    const t = new Date(s).getTime();
    return isNaN(t) ? null : t;
  }
  return null;
}

export function parseJsonArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) ?? [];
    } catch {
      return [];
    }
  }
  return [];
}
