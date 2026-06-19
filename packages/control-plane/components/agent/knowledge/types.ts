// UI-facing shapes for the Knowledge tab. These mirror the wire payloads the
// knowledge API returns (config arrives as a JSON string; status is one of a
// known set), kept local to the tab's presentation needs.

export interface KnowledgeSource {
  id: string;
  realmId: string;
  agentDid: string;
  name: string;
  sourceType: string;
  config: string;
  status: "idle" | "syncing" | "ready" | "error";
  docCount: number;
  chunkCount: number;
  lastSyncedAt: string | null;
  error: string | null;
  createdAt: string;
}

export interface KsRealmOption {
  id: string;
  name: string;
}

export interface KnowledgeFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}

export type KsSourceType = "url" | "text" | "files";
