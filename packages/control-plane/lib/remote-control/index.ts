/**
 * Remote-control lifecycle: load Telegram config from settings, manage a single
 * live connector, and expose config read/write helpers for the API.
 *
 * Settings keys (via SettingsDAO):
 *   remote_control.telegram.enabled        "true" | "false"
 *   remote_control.telegram.token_enc      vault-encrypted bot token
 *   remote_control.telegram.allowed_chats  JSON string[] of chat ids
 *   remote_control.telegram.default_agent  agent DID
 *   remote_control.telegram.agent_by_chat  JSON Record<chatId, did>
 *
 * The bot token also falls back to the TELEGRAM_BOT_TOKEN env var.
 */

import { SettingsDAO } from "@/db";
import { getWSServer } from "../ws-server";
import { encryptSecret, decryptSecret } from "../vault";
import { TelegramConnector } from "./telegram-connector";
import type {
  TelegramRemoteControlConfig,
  TelegramRemoteControlPublicConfig,
} from "./types";

const K = {
  enabled: "remote_control.telegram.enabled",
  tokenEnc: "remote_control.telegram.token_enc",
  allowedChats: "remote_control.telegram.allowed_chats",
  defaultAgent: "remote_control.telegram.default_agent",
  agentByChat: "remote_control.telegram.agent_by_chat",
} as const;

// Minimal console-backed logger; matches the connector's logger shape.
const logger = {
  info: (obj: Record<string, unknown>, msg: string) =>
    console.log(`[remote-control] ${msg}`, obj),
  warn: (obj: Record<string, unknown>, msg: string) =>
    console.warn(`[remote-control] ${msg}`, obj),
  error: (obj: Record<string, unknown>, msg: string) =>
    console.error(`[remote-control] ${msg}`, obj),
};

let connector: TelegramConnector | null = null;
// Serializes reconcile calls so a startup reconcile racing a config-update
// reconcile can never leave two connectors polling the same bot token.
let reconcileChain: Promise<void> = Promise.resolve();

function parseJsonArray(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseJsonRecord(value: string | undefined): Record<string, string> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Load the full config, including the decrypted token (or env fallback). */
export async function loadTelegramConfig(): Promise<TelegramRemoteControlConfig> {
  const rows = await SettingsDAO.getMany([
    K.enabled,
    K.tokenEnc,
    K.allowedChats,
    K.defaultAgent,
    K.agentByChat,
  ]);

  let botToken = process.env.TELEGRAM_BOT_TOKEN || undefined;
  if (rows[K.tokenEnc]) {
    try {
      botToken = await decryptSecret(rows[K.tokenEnc]);
    } catch (err) {
      // Vault not ready / key mismatch — fall back to the env token but make
      // the degraded source visible so operators aren't misled about which
      // token is live.
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "Failed to decrypt stored Telegram token; falling back to env"
      );
    }
  }

  return {
    enabled: rows[K.enabled] === "true",
    botToken,
    allowedChatIds: parseJsonArray(rows[K.allowedChats]),
    defaultAgentDid: rows[K.defaultAgent] || undefined,
    agentByChat: parseJsonRecord(rows[K.agentByChat]),
  };
}

/** The API-safe view: never leaks the token, exposes live running state. */
export async function getTelegramPublicConfig(): Promise<TelegramRemoteControlPublicConfig> {
  const cfg = await loadTelegramConfig();
  return {
    enabled: cfg.enabled,
    hasToken: Boolean(cfg.botToken),
    allowedChatIds: cfg.allowedChatIds,
    defaultAgentDid: cfg.defaultAgentDid,
    agentByChat: cfg.agentByChat,
    running: connector?.isRunning() ?? false,
  };
}

export interface TelegramConfigUpdate {
  enabled?: boolean;
  /** Plaintext token to encrypt and store; "" clears it. Omit to leave as-is. */
  botToken?: string;
  allowedChatIds?: string[];
  defaultAgentDid?: string | null;
  agentByChat?: Record<string, string>;
}

/** Persist a config update, then reconcile the running connector. */
export async function updateTelegramConfig(
  update: TelegramConfigUpdate
): Promise<TelegramRemoteControlPublicConfig> {
  if (update.enabled !== undefined) {
    await SettingsDAO.set(K.enabled, update.enabled ? "true" : "false");
  }
  if (update.botToken !== undefined) {
    if (update.botToken) {
      await SettingsDAO.set(K.tokenEnc, await encryptSecret(update.botToken));
    } else {
      await SettingsDAO.delete(K.tokenEnc);
    }
  }
  if (update.allowedChatIds !== undefined) {
    await SettingsDAO.set(
      K.allowedChats,
      JSON.stringify(update.allowedChatIds.map(String))
    );
  }
  if (update.defaultAgentDid !== undefined) {
    if (update.defaultAgentDid) {
      await SettingsDAO.set(K.defaultAgent, update.defaultAgentDid);
    } else {
      await SettingsDAO.delete(K.defaultAgent);
    }
  }
  if (update.agentByChat !== undefined) {
    await SettingsDAO.set(K.agentByChat, JSON.stringify(update.agentByChat));
  }

  await reconcileTelegramConnector();
  return getTelegramPublicConfig();
}

/**
 * Bring the live connector in line with stored config: start it when enabled
 * with a token, stop it otherwise, and restart on any config change so token /
 * allow-list edits take effect immediately.
 */
export function reconcileTelegramConnector(): Promise<void> {
  // Chain onto any in-flight reconcile so they run strictly one-at-a-time.
  reconcileChain = reconcileChain.then(doReconcile, doReconcile);
  return reconcileChain;
}

async function doReconcile(): Promise<void> {
  const cfg = await loadTelegramConfig();
  const wsServer = getWSServer();

  // Always tear down the existing connector; we restart with fresh config.
  if (connector) {
    await connector.stop();
    connector = null;
  }

  if (!cfg.enabled || !cfg.botToken || !wsServer) {
    if (cfg.enabled && !cfg.botToken) {
      logger.warn({}, "Telegram enabled but no bot token configured");
    }
    return;
  }

  try {
    connector = new TelegramConnector(cfg, wsServer, logger);
    await connector.start();
  } catch (err) {
    connector = null;
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "Failed to start Telegram connector"
    );
  }
}

/** Called once at server startup. Safe to call when config is absent. */
export async function startRemoteControl(): Promise<void> {
  await reconcileTelegramConnector();
}

/** Called on graceful shutdown. */
export async function stopRemoteControl(): Promise<void> {
  if (connector) {
    await connector.stop();
    connector = null;
  }
}
