/**
 * LiteLLM proxy admin client — the downstream target the Model Registry pushes
 * to (db/model.dao.ts, docs/PAGE_DESIGN.md §1.8).
 *
 * Direction of truth: **Postgres → LiteLLM, never back.** `listModels()` exists
 * only so the admin UI can show what the proxy currently believes; nothing here
 * writes LiteLLM's view into `ModelRegistry`. Every call site treats a LiteLLM
 * failure as non-fatal — an unconfigured or unreachable proxy degrades the
 * registry to inert catalogue data instead of blocking an admin from recording
 * a model.
 *
 * Differences from packages/control-plane's `lib/litellm-client.ts`, which this
 * is otherwise a close port of:
 *
 *  - **No module-level config cache and no `setLiteLLMConfig`/service-lifecycle
 *    singleton.** That package resolves config from two mutable module globals
 *    seeded by an `initializeLiteLLMService()` call in `server.ts`, which means
 *    a config change is only visible to whichever process ran that call — wrong
 *    in Next.js, where a Server Action and a Server Component render can be in
 *    different workers. Here every call resolves config from the `Setting` rows,
 *    so a change in the admin UI takes effect on the next request everywhere.
 *  - **No `createWorkspaceKey`/`createAgentKey`.** Virtual keys are the
 *    enforcement half of the old design and there is nothing in this package to
 *    consume one yet (no LLM-config push to Actors) — see the `ModelRegistry`
 *    schema comment. Added when that path is built, not before.
 */
import { SettingsDAO } from "@/db";
import { decryptSecret } from "./vault";
import { SETTINGS_KEYS } from "./org-settings";

export interface LiteLLMConfig {
  baseUrl: string;
  masterKey: string;
}

/**
 * DB config wins over env, matching the old package: `LITELLM_BASE_URL` /
 * `LITELLM_MASTER_KEY` are the deployment-time fallback, the `Setting` rows are
 * what an admin edits at runtime. Returns null unless BOTH halves resolve —
 * a base URL with no master key can't authenticate against the proxy's admin
 * API, so "half configured" is the same as "off" as far as callers go.
 */
export async function getLiteLLMConfig(): Promise<LiteLLMConfig | null> {
  const baseUrl = (await SettingsDAO.get(SETTINGS_KEYS.litellmBaseUrl)) || process.env.LITELLM_BASE_URL || "";

  let masterKey = "";
  const enc = await SettingsDAO.get(SETTINGS_KEYS.litellmMasterKeyEnc);
  if (enc) {
    try {
      masterKey = await decryptSecret(enc);
    } catch (err) {
      // A stored key we can no longer open (e.g. the server identity was
      // regenerated under it) is reported as unconfigured rather than throwing
      // — otherwise every page that merely *checks* LiteLLM would 500.
      console.error("[litellm] failed to decrypt stored master key", err);
    }
  }
  if (!masterKey) masterKey = process.env.LITELLM_MASTER_KEY || "";

  if (!baseUrl || !masterKey) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ""), masterKey };
}

export async function isLiteLLMConfigured(): Promise<boolean> {
  return (await getLiteLLMConfig()) !== null;
}

/** The base URL alone, for display — resolves even when the master key doesn't,
 *  so the admin UI can say "URL set, master key missing" rather than just "off". */
export async function getLiteLLMBaseUrl(): Promise<string | null> {
  const fromDb = await SettingsDAO.get(SETTINGS_KEYS.litellmBaseUrl);
  return (fromDb || process.env.LITELLM_BASE_URL || "").replace(/\/+$/, "") || null;
}

async function litellmFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const config = await getLiteLLMConfig();
  if (!config) {
    throw new Error("LiteLLM is not configured — set a proxy URL and master key under Integrations → Models");
  }
  return fetch(`${config.baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.masterKey}`,
      ...options.headers,
    },
    signal: AbortSignal.timeout(10_000),
  });
}

export interface RegisterModelParams {
  /** The name callers reference this model by — our `ModelRegistry.litellmModelName`. */
  modelName: string;
  /** The upstream model id, in LiteLLM's `<wire-format>/<model>` form. */
  litellmModel: string;
  apiBase: string;
  /** Plaintext provider key. Callers decrypt `apiKeyEnc` themselves — passing
   *  ciphertext here silently registers a model that can never authenticate,
   *  which is exactly the bug in packages/control-plane's update route. */
  apiKey?: string;
}

/** Register (or overwrite) a model in the proxy. Idempotent on `modelName`. */
export async function registerModel(params: RegisterModelParams): Promise<void> {
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
    throw new Error(`LiteLLM registerModel failed (${res.status}): ${await res.text()}`);
  }
}

/** Remove a model from the proxy. A 404 is success — the end state is the same. */
export async function removeModel(modelName: string): Promise<void> {
  const res = await litellmFetch("/model/delete", {
    method: "POST",
    body: JSON.stringify({ model_name: modelName }),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`LiteLLM removeModel failed (${res.status}): ${await res.text()}`);
  }
}

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await litellmFetch("/health/liveliness");
    return res.ok;
  } catch {
    return false;
  }
}

export interface LiteLLMRegisteredModel {
  name: string;
  params: Record<string, unknown>;
}

/** What the proxy currently has registered — display only (see the file header). */
export async function listModels(): Promise<LiteLLMRegisteredModel[]> {
  const res = await litellmFetch("/model/info");
  if (!res.ok) return [];
  const data = (await res.json()) as {
    data?: { model_name: string; litellm_params?: Record<string, unknown> }[];
  };
  return (data.data ?? []).map((m) => ({ name: m.model_name, params: m.litellm_params ?? {} }));
}

/**
 * The name a model is registered under inside LiteLLM. Namespaced by provider so
 * two providers' "gpt-4o" can coexist, and slugged because this string ends up
 * in a URL path and an allowlist entry.
 */
export function litellmModelNameFor(provider: string, name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${provider}/${slug || "model"}`;
}

/**
 * Probe a provider endpoint directly (not through LiteLLM) for its model list,
 * so the register form can confirm an endpoint + key actually work *before* a
 * row is written. OpenAI-wire `GET {baseUrl}/models`, which every provider this
 * registry targets implements — Ollama included.
 *
 * Never throws: returns the failure as data, because this is a UI affordance and
 * "couldn't reach it" is a legitimate, displayable answer.
 */
export async function probeProviderModels(
  baseUrl: string,
  apiKey?: string
): Promise<{ ok: boolean; models: string[]; error?: string }> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return { ok: false, models: [], error: `HTTP ${res.status}` };
    const data = (await res.json()) as { data?: { id?: string }[]; models?: { name?: string }[] };
    // OpenAI wire shape first, then Ollama's native `/api/tags`-style shape, which
    // some local servers also return from `/models`.
    const models = (data.data ?? []).map((m) => m.id).filter((id): id is string => !!id);
    const ollama = (data.models ?? []).map((m) => m.name).filter((n): n is string => !!n);
    return { ok: true, models: models.length > 0 ? models : ollama };
  } catch (err) {
    return { ok: false, models: [], error: err instanceof Error ? err.message : "unreachable" };
  }
}
