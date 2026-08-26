/**
 * The LLM provider union and the one predicate the control plane's Model
 * Registry needs.
 *
 * Extracted from the former `types.ts` when the monorepo was reduced to the
 * control plane + dispatcher + Go clients: everything else in that file
 * described the chat/workflow/agent surface `docs/REBUILD_ARCHITECTURE.md` §2
 * cuts. Provider identity survives because the Model Registry catalogues
 * endpoints regardless of what talks to them.
 */

export type LlmProviderType =
  | "openai"
  | "anthropic"
  | "google"
  | "ollama"
  | "openai-compatible"
  | "claude-agent-sdk"
  | "cursor-agent-sdk"
  | "openai-agent-sdk";

/** Providers that wrap a vendor agent harness (Mastra SDK Agents) instead of a plain chat model. */
export const SDK_AGENT_PROVIDERS = new Set<LlmProviderType>([
  "claude-agent-sdk",
  "cursor-agent-sdk",
  "openai-agent-sdk",
]);

/**
 * True for providers that run a vendor's own agent harness (own tool loop,
 * permissions, sessions) rather than a plain chat model behind the AI SDK —
 * these are not OpenAI-compatible network endpoints and cannot be routed
 * through LiteLLM.
 */
export function isSdkAgentProvider(provider: LlmProviderType): boolean {
  return SDK_AGENT_PROVIDERS.has(provider);
}
