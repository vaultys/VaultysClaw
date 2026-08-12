/**
 * Per-provider defaults for the model registration form — the "pick a provider
 * and the endpoint fills itself in" affordance, ported from
 * packages/control-plane's `components/models/RegisterModelForm.tsx` `PROVIDERS`
 * table but lifted out of the component so the Server Action validating a
 * submission and the form rendering it agree on one list.
 *
 * The provider union itself is `@vaultysclaw/shared`'s `LlmProviderType` — not
 * redeclared here — so adding a provider is one edit there plus one row here.
 */
import { type LlmProviderType, isSdkAgentProvider } from "@vaultysclaw/shared";

export interface ProviderMeta {
  label: string;
  /** Prefilled base URL. Empty for SDK-agent providers, which have no endpoint. */
  defaultBaseUrl: string;
  /** A representative model id, shown as the field's placeholder. */
  exampleModelId: string;
  /** Whether the provider expects an API key at all (Ollama and friends don't). */
  needsApiKey: boolean;
}

export const PROVIDERS: Record<LlmProviderType, ProviderMeta> = {
  openai: {
    label: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    exampleModelId: "gpt-4o",
    needsApiKey: true,
  },
  anthropic: {
    label: "Anthropic",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    exampleModelId: "claude-sonnet-4-5",
    needsApiKey: true,
  },
  google: {
    label: "Google",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    exampleModelId: "gemini-2.0-flash",
    needsApiKey: true,
  },
  ollama: {
    label: "Ollama (local)",
    defaultBaseUrl: "http://localhost:11434/v1",
    exampleModelId: "llama3.2",
    needsApiKey: false,
  },
  "openai-compatible": {
    label: "OpenAI-compatible",
    defaultBaseUrl: "http://localhost:1234/v1",
    exampleModelId: "local-model",
    needsApiKey: false,
  },
  "claude-agent-sdk": {
    label: "Claude Agent SDK",
    defaultBaseUrl: "",
    exampleModelId: "claude-sonnet-4-5",
    needsApiKey: true,
  },
  "cursor-agent-sdk": {
    label: "Cursor Agent SDK",
    defaultBaseUrl: "",
    exampleModelId: "cursor-fast",
    needsApiKey: true,
  },
  "openai-agent-sdk": {
    label: "OpenAI Agent SDK",
    defaultBaseUrl: "",
    exampleModelId: "gpt-4o",
    needsApiKey: true,
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as LlmProviderType[];

export function isKnownProvider(value: string): value is LlmProviderType {
  return value in PROVIDERS;
}

/**
 * Whether a registry entry can be pushed to LiteLLM at all. SDK-agent providers
 * run a vendor's own harness rather than exposing an OpenAI-wire endpoint, so
 * there is nothing for a proxy to route (`isSdkAgentProvider`'s own doc comment
 * says as much) — registering one would create a model that fails at first use.
 */
export function isRoutableThroughLiteLLM(provider: string): boolean {
  return isKnownProvider(provider) && !isSdkAgentProvider(provider);
}
