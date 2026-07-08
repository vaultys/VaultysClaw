import { type LlmProviderType } from "@vaultysclaw/shared";

export type ConfigMode = "agent-key" | "workspace" | "model" | "manual";
export type ModelSource = "litellm" | "registry";

/** Derived view of the agent's LiteLLM virtual key (lives on the agent record). */
export interface AgentKeyInfo {
  configured: boolean;
  keyPrefix: string | null;
  allowedModels: string[];
  dailyBudget: number | null;
  updatedAt: string | null;
  litellmConfigured: boolean;
}

export interface ProviderOption {
  value: LlmProviderType;
  label: string;
  needsKey: boolean;
  needsUrl: boolean;
}

export const PROVIDER_OPTIONS: ProviderOption[] = [
  { value: "openai", label: "OpenAI", needsKey: true, needsUrl: false },
  { value: "anthropic", label: "Anthropic", needsKey: true, needsUrl: false },
  { value: "google", label: "Google Gemini", needsKey: true, needsUrl: false },
  { value: "ollama", label: "Ollama (local)", needsKey: false, needsUrl: true },
  {
    value: "openai-compatible",
    label: "OpenAI-compatible",
    needsKey: true,
    needsUrl: true,
  },
  {
    value: "claude-agent-sdk",
    label: "Claude Agent SDK (experimental)",
    needsKey: true,
    needsUrl: false,
  },
  {
    value: "cursor-agent-sdk",
    label: "Cursor Agent SDK (experimental)",
    needsKey: true,
    needsUrl: false,
  },
  {
    value: "openai-agent-sdk",
    label: "OpenAI Agents SDK (experimental)",
    needsKey: true,
    needsUrl: false,
  },
];

export const PROVIDER_COLORS: Record<string, string> = {
  openai: "bg-success-100 text-success-700 border-success-300",
  "openai-compatible": "bg-primary-100 text-primary-700 border-primary-300",
  anthropic: "bg-warning-100 text-warning-700 border-warning-300",
  google: "bg-warning-100 text-warning-700 border-warning-300",
  ollama: "bg-secondary-100 text-secondary-700 border-secondary-300",
  "claude-agent-sdk": "bg-warning-100 text-warning-700 border-warning-300",
  "cursor-agent-sdk": "bg-primary-100 text-primary-700 border-primary-300",
  "openai-agent-sdk": "bg-success-100 text-success-700 border-success-300",
};

/** Placeholder model name shown in the manual form per provider. */
export function modelPlaceholder(provider: LlmProviderType): string {
  switch (provider) {
    case "openai":
      return "gpt-4o";
    case "anthropic":
      return "claude-sonnet-4-5";
    case "google":
      return "gemini-2.5-flash";
    case "ollama":
      return "llama3.2";
    case "claude-agent-sdk":
      return "claude-sonnet-4-5";
    case "cursor-agent-sdk":
      return "auto";
    case "openai-agent-sdk":
      return "gpt-5.4-mini";
    default:
      return "model-name";
  }
}
