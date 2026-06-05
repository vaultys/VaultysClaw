import { ModelRegistry } from "@prisma/client";
import { LlmConfig } from "@vaultysclaw/shared";

export type FileContent = {
  content: string;
};

export type SafeLlmConfig = Omit<LlmConfig, "apiKey"> & { apiKeySet: boolean };

export type AgentRealmInfo = {
  realmId: string;
  realmName: string;
  isPrimary: boolean;
  hasVirtualKey: boolean;
  models: ModelRegistry[];
};

export type RealmLlmData = {
  litellmConfigured: boolean;
  litellmBaseUrl: string | null;
  realms: AgentRealmInfo[];
};
