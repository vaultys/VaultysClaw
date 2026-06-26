/**
 * Remote-control connectors let a user drive an agent from their phone over a
 * consumer messaging app (Telegram first; WhatsApp planned). An inbound message
 * is routed to a target agent via the existing `sendChatToAgent` streaming path,
 * and the agent's reply is sent back to the same chat.
 *
 * Config is persisted via `SettingsDAO` under the `remote_control.*` keys. The
 * bot token is stored encrypted in the vault, never in plaintext settings.
 */

/** A Telegram chat id (number) is stored as a string for JSON friendliness. */
export type TelegramChatId = string;

export interface TelegramRemoteControlConfig {
  /** Master switch. When false the connector never starts polling. */
  enabled: boolean;
  /**
   * Bot token from @BotFather. Optional in the *resolved public* view (it is
   * redacted in API responses) but required for the connector to start.
   */
  botToken?: string;
  /**
   * Chat ids allowed to control agents. Empty = nobody (deny-by-default).
   * A chat id is a user's DM id or a group id.
   */
  allowedChatIds: TelegramChatId[];
  /**
   * DID of the agent a chat talks to when no per-chat override exists.
   * Required for the connector to do anything useful.
   */
  defaultAgentDid?: string;
  /** Optional per-chat agent override: chatId -> agent DID. */
  agentByChat?: Record<TelegramChatId, string>;
}

/** Public shape returned by the config API: token presence, never the value. */
export interface TelegramRemoteControlPublicConfig {
  enabled: boolean;
  hasToken: boolean;
  allowedChatIds: TelegramChatId[];
  defaultAgentDid?: string;
  agentByChat?: Record<TelegramChatId, string>;
  /** Live runtime status of the polling connector. */
  running: boolean;
}

/** Resolve which agent a given chat should talk to. */
export function resolveAgentForChat(
  config: TelegramRemoteControlConfig,
  chatId: TelegramChatId
): string | undefined {
  return config.agentByChat?.[chatId] ?? config.defaultAgentDid;
}

/** Deny-by-default allow-list check. */
export function isChatAllowed(
  config: TelegramRemoteControlConfig,
  chatId: TelegramChatId
): boolean {
  return config.allowedChatIds.includes(chatId);
}
