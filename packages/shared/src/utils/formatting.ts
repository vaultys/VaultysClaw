/**
 * Formatting utilities for time, uptime, duration, and display values.
 * Shared across agent-controller web/TUI and control-plane UI.
 */

/**
 * Format uptime in seconds to human-readable format (e.g., "2h 30m")
 */
export function fmtUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

/**
 * Format ISO8601 timestamp to relative time (e.g., "5m ago", "2h ago")
 */
export function formatTime(dateString: string): string {
  const d = new Date(dateString);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

/**
 * Format ISO8601 timestamp to HH:MM:SS time only
 */
export function formatTimeOnly(dateString: string): string {
  return dateString.slice(11, 19);
}

/**
 * Format ISO8601 timestamp to readable date (e.g., "May 28, 2026")
 */
export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString();
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
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";
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
