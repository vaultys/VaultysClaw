import {
  FolderOpen,
  Globe,
  Monitor,
  Plug,
  Mail,
  Code,
  Bot,
  Terminal,
  BookOpen,
} from "lucide-react";
import { daysFromNow, parseUTC } from "@vaultysclaw/shared";

// ── Capability metadata ─────────────────────────────────────────────────────

export const CAPABILITY_ICONS: Record<string, React.ReactNode> = {
  file_access: <FolderOpen size={13} />,
  internet_access: <Globe size={13} />,
  browser_control: <Monitor size={13} />,
  api_call: <Plug size={13} />,
  mail_send: <Mail size={13} />,
  code_execution: <Code size={13} />,
  agent_communication: <Bot size={13} />,
  system_command: <Terminal size={13} />,
  knowledge_search: <BookOpen size={13} />,
};

export const ALL_CAPABILITIES = [
  "file_access",
  "internet_access",
  "browser_control",
  "api_call",
  "mail_send",
  "code_execution",
  "system_command",
  "agent_communication",
  "knowledge_search",
];

export const HIGH_RISK_CAPS = new Set([
  "system_command",
  "code_execution",
  "browser_control",
]);

// ── Audit event labels ──────────────────────────────────────────────────────

export const ACTIVITY_LABELS: Record<string, string> = {
  agent_reconnected: "Agent reconnected",
  agent_authenticated: "Agent authenticated",
  registration_requested: "Registration requested",
  registration_approved: "Registration approved",
  registration_rejected: "Registration rejected",
  agent_disconnected: "Agent disconnected",
  capabilities_updated: "Capabilities updated",
  auth_failed: "Auth failed",
  user_authenticated: "User authenticated",
};

export const CERT_STATE_LABELS: Record<number, string> = {
  0: "Initial",
  1: "Challenge sent",
  2: "Complete ✓",
  [-1]: "Failed ✗",
  [-2]: "Error ✗",
};

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Format an ISO timestamp (assumed UTC) as a localized date-time string. */
export function formatAuditDate(iso: string | null): string {
  if (!iso) return "—";
  return parseUTC(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Given an original expiry, suggest the same duration from now (min 1 day). */
export function suggestRenewalExpiry(originalExpiresAt: string | null): string {
  if (originalExpiresAt) {
    const orig = parseUTC(originalExpiresAt);
    const durationMs = orig.getTime() - Date.now();
    const days = Math.max(1, Math.round(durationMs / 86_400_000));
    return daysFromNow(days);
  }
  return daysFromNow(30);
}
