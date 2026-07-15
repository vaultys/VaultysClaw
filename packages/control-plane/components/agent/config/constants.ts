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

/**
 * Curated static model choices per provider, shown in the Model combobox.
 * There is no dynamic-discovery API for these providers/CLIs (checked: the
 * `codex` and `gemini` CLIs only expose a free-text `-m/--model` flag, and
 * neither `cursor-agent` nor `@mastra/cursor` expose a list-models call), so
 * this list is curated by hand and kept modest — a handful of well-known,
 * current model ids per provider. The combobox always allows freeform entry
 * too, so an unlisted or brand-new model id can still be typed in directly.
 *
 * `claude-agent-sdk` is deliberately absent here: its options are fetched
 * live via `/api/admin/agents/:did/claude-models` (backed by the Claude Agent
 * SDK's `supportedModels()`), with this list only used as a fallback if
 * that fetch fails.
 */
export const STATIC_MODEL_OPTIONS: Partial<Record<LlmProviderType, string[]>> = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-5.4", "gpt-5.4-mini"],
  anthropic: [
    "claude-sonnet-4-5",
    "claude-opus-4-5",
    "claude-haiku-4-5",
  ],
  google: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
  "cursor-agent-sdk": ["auto", "gpt-5.4", "claude-sonnet-4-5", "sonnet-4-5-thinking"],
  "openai-agent-sdk": ["gpt-5.4-mini", "gpt-5.4", "gpt-4o"],
  // Fetched dynamically at runtime — see doc above; this is only the fallback.
  "claude-agent-sdk": ["claude-sonnet-4-5", "claude-opus-4-5", "claude-haiku-4-5"],
};

/** Static fallback model list for a provider (used when dynamic fetch fails or isn't applicable). */
export function staticModelOptions(provider: LlmProviderType): string[] {
  return STATIC_MODEL_OPTIONS[provider] ?? [];
}
