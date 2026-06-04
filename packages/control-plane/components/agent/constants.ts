export const ALL_CAPABILITIES = [
  { id: "file_access", label: "File Access" },
  { id: "internet_access", label: "Internet Access" },
  { id: "browser_control", label: "Browser Control" },
  { id: "api_call", label: "API Call" },
  { id: "mail_send", label: "Mail Send" },
  { id: "code_execution", label: "Code Execution" },
  { id: "system_command", label: "System Command" },
  { id: "agent_communication", label: "Agent Communication" },
  { id: "knowledge_search", label: "Knowledge Search" },
] as const;

export const AUDIT_LABELS: Record<string, string> = {
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
