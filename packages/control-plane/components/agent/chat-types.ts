// UI-only chat types. API-derived shapes (chat sessions, history messages)
// come from the contract / `@vaultysclaw/shared` (`ChatSession`,
// `ChatHistoryMessage`) — these are the local view-model types that have no
// server counterpart.

export interface PendingApproval {
  requestId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: "pending" | "submitting" | "approved" | "rejected";
}
