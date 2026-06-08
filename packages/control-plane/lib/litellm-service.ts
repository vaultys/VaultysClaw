/**
 * LiteLLM service manager.
 *
 * Mirrors the PeerJS service pattern: non-blocking initialisation at startup,
 * with start/stop/reconnect operations that can be triggered from the API.
 *
 * The "service" here is the connection to the LiteLLM proxy — i.e. having a
 * valid base URL + master key loaded into the litellm-client module so that
 * model registration, realm key generation, etc. all work.
 */

import pino from "pino";
import { setLiteLLMConfig, isLiteLLMConfigured, healthCheck } from "./litellm-client";
import { getLiteLLMSettings } from "../db/settings.dao";

const logger = pino({ name: "litellm-service" });

export type LiteLLMServiceStatus = "unconfigured" | "connecting" | "connected" | "error";

interface ServiceState {
  status: LiteLLMServiceStatus;
  baseUrl: string | null;
  lastError: string | null;
  checkedAt: Date | null;
}

const state: ServiceState = {
  status: "unconfigured",
  baseUrl: null,
  lastError: null,
  checkedAt: null,
};

/** Read settings from DB (or fall back to env vars) and apply to litellm-client. */
async function applySettings(): Promise<void> {
  const dbSettings = await getLiteLLMSettings();
  setLiteLLMConfig(dbSettings.baseUrl, dbSettings.masterKey);
  state.baseUrl = dbSettings.baseUrl ?? process.env.LITELLM_BASE_URL ?? null;
}

/** Probe the proxy and update state. */
async function probe(): Promise<boolean> {
  if (!isLiteLLMConfigured()) {
    state.status = "unconfigured";
    state.checkedAt = new Date();
    return false;
  }
  const ok = await healthCheck();
  state.status = ok ? "connected" : "error";
  state.lastError = ok ? null : "Proxy did not respond";
  state.checkedAt = new Date();
  return ok;
}

/**
 * Non-blocking initialisation called once at server startup.
 * Loads config from DB then does a background health probe.
 * Any failure is logged as a warning — the server always starts.
 */
export function initializeLiteLLMService(): void {
  applySettings()
    .then(() => {
      if (!isLiteLLMConfigured()) {
        logger.info("LiteLLM not configured — set LITELLM_BASE_URL + LITELLM_MASTER_KEY or configure via /models");
        return;
      }
      state.status = "connecting";
      return probe().then((ok) => {
        if (ok) logger.info({ baseUrl: state.baseUrl }, "LiteLLM proxy connected");
        else logger.warn({ baseUrl: state.baseUrl }, "LiteLLM proxy not reachable — will retry on next request");
      });
    })
    .catch((err) => {
      logger.warn({ err: String(err) }, "LiteLLM service init failed — continuing without proxy");
      state.status = "error";
      state.lastError = String(err);
    });
}

/**
 * (Re-)connect: reload settings from DB and probe.
 * Called from PUT /api/settings/litellm after saving new config.
 */
export async function reconnectLiteLLMService(): Promise<{
  ok: boolean;
  status: LiteLLMServiceStatus;
  baseUrl: string | null;
}> {
  state.status = "connecting";
  await applySettings().catch((err) => {
    state.lastError = String(err);
    state.status = "error";
  });
  const ok = await probe();
  return { ok, status: state.status, baseUrl: state.baseUrl };
}

/** Disconnect: clear config and reset state. */
export function disconnectLiteLLMService(): void {
  setLiteLLMConfig(null, null);
  state.status = "unconfigured";
  state.baseUrl = null;
  state.lastError = null;
  state.checkedAt = null;
  logger.info("LiteLLM service disconnected");
}

/** Current service state (for the settings API). */
export function getLiteLLMServiceState(): ServiceState {
  return { ...state };
}
