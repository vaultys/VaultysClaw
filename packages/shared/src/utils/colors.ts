/**
 * Color mappings for status, log levels, and other semantic indicators.
 * Used by both web UI (Tailwind classes) and TUI (terminal colors).
 */

/** Agent/connection status to color mapping */
export const STATUS_COLORS = {
  connected: "green",
  connecting: "yellow",
  pending_approval: "cyan",
  disconnected: "red",
  initializing: "gray",
  error: "red",
  success: "green",
  warning: "yellow",
  pending: "yellow",
  failed: "red",
} as const;

/** Log level to color mapping */
export const LOG_LEVEL_COLORS = {
  error: "red",
  warn: "yellow",
  warning: "yellow",
  info: "white",
  debug: "gray",
  log: "white",
} as const;

/** Tailwind CSS color classes for status */
export const STATUS_TAILWIND = {
  connected: "text-green-600",
  connecting: "text-yellow-600",
  pending_approval: "text-cyan-600",
  disconnected: "text-red-600",
  initializing: "text-gray-600",
  error: "text-red-600",
  success: "text-green-600",
  warning: "text-yellow-600",
  pending: "text-yellow-600",
  failed: "text-red-600",
} as const;

/** Tailwind CSS background color classes for badges */
export const BADGE_COLORS = {
  success: "bg-green-100 text-green-800",
  error: "bg-red-100 text-red-800",
  warning: "bg-yellow-100 text-yellow-800",
  info: "bg-blue-100 text-blue-800",
  neutral: "bg-gray-100 text-gray-800",
} as const;

/** Get terminal color for status (TUI) */
export function getStatusColor(status: string): string {
  return STATUS_COLORS[status as keyof typeof STATUS_COLORS] ?? "white";
}

/** Get terminal color for log level (TUI) */
export function getLogLevelColor(level: string): string {
  return LOG_LEVEL_COLORS[level as keyof typeof LOG_LEVEL_COLORS] ?? "white";
}

/** Get Tailwind class for status */
export function getStatusTailwindClass(status: string): string {
  return STATUS_TAILWIND[status as keyof typeof STATUS_TAILWIND] ?? "text-gray-600";
}

/** Get Tailwind class for badge */
export function getBadgeColorClass(type: "success" | "error" | "warning" | "info" | "neutral"): string {
  return BADGE_COLORS[type];
}

/** Map status to background color class (Tailwind) */
export const STATUS_BG_COLORS = {
  connected: "bg-green-50",
  connecting: "bg-yellow-50",
  pending_approval: "bg-cyan-50",
  disconnected: "bg-red-50",
  initializing: "bg-gray-50",
  error: "bg-red-50",
  success: "bg-green-50",
  warning: "bg-yellow-50",
  pending: "bg-yellow-50",
  failed: "bg-red-50",
} as const;

/** Get background color class for status */
export function getStatusBgClass(status: string): string {
  return STATUS_BG_COLORS[status as keyof typeof STATUS_BG_COLORS] ?? "bg-gray-50";
}

/** Common emoji reactions */
export const COMMON_EMOJIS = ["👍", "❤️", "😂", "🎉", "🔥", "👀", "😮", "😢"] as const;
