import { LlmConfig } from "@vaultysclaw/shared";

export type FileContent = {
  content: string;
};

export type SafeLlmConfig = Omit<LlmConfig, "apiKey"> & { apiKeySet: boolean };
