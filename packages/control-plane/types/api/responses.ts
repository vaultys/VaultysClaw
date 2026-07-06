import { ModelRegistry } from "@prisma/client";
import { LlmConfig } from "@vaultysclaw/shared";

export type FileContent = {
  content: string;
};

export type SafeLlmConfig = Omit<LlmConfig, "apiKey"> & { apiKeySet: boolean };

export type AgentWorkspaceInfo = {
  workspaceId: string;
  workspaceName: string;
  isPrimary: boolean;
  hasVirtualKey: boolean;
  models: ModelRegistry[];
};

export type TokenUsageBucket = {
  bucket: string;
  promptTokens: number;
  completionTokens: number;
};

export type TokenUsageHistory = {
  granularity: "day" | "month";
  from: string;
  to: string;
  data: TokenUsageBucket[];
};

export type WorkspaceLlmData = {
  litellmConfigured: boolean;
  litellmBaseUrl: string | null;
  workspaces: AgentWorkspaceInfo[];
};
