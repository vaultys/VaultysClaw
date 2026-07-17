import type { LlmProviderType } from "@vaultysclaw/shared";

/**
 * Browser-side discovery of local LLM servers.
 *
 * The probe runs from the admin's browser (not the control-plane server), so it
 * finds the models on the admin's own machine. This means it depends on each
 * server's CORS policy (Ollama may need OLLAMA_ORIGINS, LM Studio has a CORS
 * toggle) and, if the app is served over HTTPS, on mixed-content rules for
 * http://localhost. A blocked/unreachable server is reported as not reachable
 * rather than throwing, so one failure never aborts the whole scan.
 */

export interface LocalServer {
  /** Stable id: "lmstudio" | "ollama" | "vllm" */
  id: string;
  /** Human label shown in the UI */
  label: string;
  /** Provider to register the model under */
  provider: LlmProviderType;
  /** Base URL of the server */
  baseUrl: string;
  /** Which endpoint to probe / how to parse the response */
  kind: "openai" | "ollama";
}

export const LOCAL_SERVERS: LocalServer[] = [
  {
    id: "lmstudio",
    label: "LM Studio",
    provider: "openai-compatible",
    baseUrl: "http://localhost:1234",
    kind: "openai",
  },
  {
    id: "ollama",
    label: "Ollama",
    provider: "ollama",
    baseUrl: "http://localhost:11434",
    kind: "ollama",
  },
  {
    id: "vllm",
    label: "vLLM / OpenAI-compatible",
    provider: "openai-compatible",
    baseUrl: "http://localhost:8000",
    kind: "openai",
  },
];

export interface LocalDiscoveryResult {
  server: LocalServer;
  reachable: boolean;
  models: string[];
  error?: string;
}

/** Parse an OpenAI-compatible `/v1/models` response — `{ data: [{ id }] }`. */
export function parseOpenAiModels(json: unknown): string[] {
  const data = (json as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  return data
    .map((m) => (m as { id?: unknown })?.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

/** Parse an Ollama `/api/tags` response — `{ models: [{ name }] }`. */
export function parseOllamaModels(json: unknown): string[] {
  const models = (json as { models?: unknown })?.models;
  if (!Array.isArray(models)) return [];
  return models
    .map((m) => (m as { name?: unknown })?.name)
    .filter((name): name is string => typeof name === "string" && name.length > 0);
}

/** Probe a single local server. Never throws — failures come back as `reachable: false`. */
export async function probeServer(
  server: LocalServer
): Promise<LocalDiscoveryResult> {
  const base = server.baseUrl.replace(/\/$/, "");
  const path = server.kind === "ollama" ? "/api/tags" : "/v1/models";
  try {
    const res = await fetch(`${base}${path}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      return {
        server,
        reachable: false,
        models: [],
        error: `HTTP ${res.status}`,
      };
    }
    const json = await res.json();
    const models =
      server.kind === "ollama"
        ? parseOllamaModels(json)
        : parseOpenAiModels(json);
    return { server, reachable: true, models };
  } catch (err) {
    return {
      server,
      reachable: false,
      models: [],
      error:
        err instanceof Error && err.name === "TimeoutError"
          ? "No response (timeout)"
          : "Not reachable (offline or CORS blocked)",
    };
  }
}

/** Probe all known local servers in parallel. */
export async function discoverLocalModels(
  servers: LocalServer[] = LOCAL_SERVERS
): Promise<LocalDiscoveryResult[]> {
  return Promise.all(servers.map(probeServer));
}
