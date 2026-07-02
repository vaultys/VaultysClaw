/**
 * LiteLLM Proxy management client.
 * Handles dynamic model registration and per-workspace virtual key management.
 * Requires LITELLM_BASE_URL and LITELLM_MASTER_KEY env vars.
 */

// In-memory overrides loaded from DB at startup (take precedence over env vars).
// Call setLiteLLMConfig() from server.ts after reading DB settings.
let _baseUrlOverride: string | null = null;
let _masterKeyOverride: string | null = null;

export function setLiteLLMConfig(baseUrl: string | null, masterKey: string | null): void {
  _baseUrlOverride = baseUrl || null;
  _masterKeyOverride = masterKey || null;
}

// Read at call time so tests can override process.env without module-reload
function getBaseUrl(): string {
  return _baseUrlOverride ?? process.env.LITELLM_BASE_URL ?? "";
}
function getMasterKey(): string {
  return _masterKeyOverride ?? process.env.LITELLM_MASTER_KEY ?? "";
}

export function isLiteLLMConfigured(): boolean {
  return Boolean(getBaseUrl() && getMasterKey());
}

/** Return the configured LiteLLM base URL (undefined when not set). */
export function getLiteLLMBaseUrl(): string | undefined {
  return getBaseUrl() || undefined;
}

async function litellmFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  if (!isLiteLLMConfigured()) {
    throw new Error(
      "LiteLLM not configured — set LITELLM_BASE_URL and LITELLM_MASTER_KEY"
    );
  }
  return fetch(`${getBaseUrl()}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getMasterKey()}`,
      ...options.headers,
    },
  });
}

export interface LiteLLMModelParams {
  /** The name agents use to reference this model (e.g. "ft-llama3-support") */
  modelName: string;
  /** Underlying model id passed to the backend (e.g. "openai/meta-llama-3-8b-instruct") */
  litellmModel: string;
  apiBase: string;
  apiKey?: string;
}

/** Register a model with LiteLLM proxy. Idempotent — overwrites if name already exists. */
export async function registerModel(params: LiteLLMModelParams): Promise<void> {
  const res = await litellmFetch("/model/new", {
    method: "POST",
    body: JSON.stringify({
      model_name: params.modelName,
      litellm_params: {
        model: params.litellmModel,
        api_base: params.apiBase,
        ...(params.apiKey ? { api_key: params.apiKey } : {}),
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LiteLLM registerModel failed (${res.status}): ${text}`);
  }
}

/** Remove a model from LiteLLM proxy. */
export async function removeModel(modelName: string): Promise<void> {
  const res = await litellmFetch("/model/delete", {
    method: "POST",
    body: JSON.stringify({ model_name: modelName }),
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`LiteLLM removeModel failed (${res.status}): ${text}`);
  }
}

export interface CreateWorkspaceKeyResult {
  virtualKey: string;
}

/** Create or refresh a team-scoped virtual key for a workspace. */
export async function createWorkspaceKey(
  workspaceId: string,
  allowedModels: string[],
  monthlyBudgetUsd?: number
): Promise<CreateWorkspaceKeyResult> {
  const res = await litellmFetch("/key/generate", {
    method: "POST",
    body: JSON.stringify({
      team_id: workspaceId,
      models: allowedModels.length > 0 ? allowedModels : ["all-team-models"],
      ...(monthlyBudgetUsd != null ? { max_budget: monthlyBudgetUsd } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LiteLLM createWorkspaceKey failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { key: string };
  return { virtualKey: data.key };
}

/** Create or refresh an agent-scoped virtual key with optional per-day budget. */
export async function createAgentKey(
  agentDid: string,
  allowedModels: string[],
  dailyBudgetUsd?: number
): Promise<string> {
  const res = await litellmFetch("/key/generate", {
    method: "POST",
    body: JSON.stringify({
      team_id: agentDid,
      models: allowedModels.length > 0 ? allowedModels : ["all-team-models"],
      ...(dailyBudgetUsd != null
        ? { max_budget: dailyBudgetUsd, budget_duration: "1d" }
        : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LiteLLM createAgentKey failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { key: string };
  return data.key;
}

/** Check if the LiteLLM proxy is reachable. */
export async function healthCheck(): Promise<boolean> {
  try {
    const res = await litellmFetch("/health/liveliness");
    return res.ok;
  } catch {
    return false;
  }
}

/** List models currently registered in LiteLLM. */
export async function listModels(): Promise<
  { model_name: string; litellm_params: Record<string, unknown> }[]
> {
  const res = await litellmFetch("/model/info");
  if (!res.ok) return [];
  const data = (await res.json()) as {
    data?: { model_name: string; litellm_params: Record<string, unknown> }[];
  };
  return data.data ?? [];
}
