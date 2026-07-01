// UI-facing shapes for the Knowledge tab. These mirror the wire payloads the
// knowledge API returns (config arrives as a JSON string; status is one of a
// known set), kept local to the tab's presentation needs.

export interface KsWorkspaceOption {
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
