/**
 * Telegram remote-control connector.
 *
 * Long-polls the Telegram Bot API for inbound messages, routes each allowed
 * message to a target agent via the control plane's existing streaming chat
 * path (`AgentWSServer.sendChatToAgent`), buffers the streamed reply, and sends
 * it back to the originating chat.
 *
 * One conversation per chat (`tg:<chatId>`) so the agent keeps context across
 * messages, mirroring the 1:1 "control my agent from my phone" model.
 */

import { randomBytes } from "crypto";
import type { AgentWSServer } from "../ws-server";
import type { WSChatResponsePayload, ChatMessageEntry } from "@vaultysclaw/shared";
import {
  TelegramApi,
  type TelegramUpdate,
  type TelegramMessage,
} from "./telegram-api";
import {
  type TelegramRemoteControlConfig,
  isChatAllowed,
  resolveAgentForChat,
} from "./types";

/** Server-side long-poll window; Telegram holds the request open this long. */
const LONG_POLL_TIMEOUT_SECONDS = 25;
/** How long we wait for the agent's full reply before giving up. */
const REPLY_TIMEOUT_MS = 90_000;
/** Backoff after a polling error before retrying. */
const ERROR_BACKOFF_MS = 5_000;

interface ConnectorLogger {
  info: (obj: Record<string, unknown>, msg: string) => void;
  warn: (obj: Record<string, unknown>, msg: string) => void;
  error: (obj: Record<string, unknown>, msg: string) => void;
}

export class TelegramConnector {
  private readonly api: TelegramApi;
  private running = false;
  private offset = 0;
  private abort?: AbortController;
  private loopPromise?: Promise<void>;

  constructor(
    private readonly config: TelegramRemoteControlConfig,
    private readonly wsServer: AgentWSServer,
    private readonly logger: ConnectorLogger
  ) {
    if (!config.botToken) {
      throw new Error("TelegramConnector requires a bot token");
    }
    this.api = new TelegramApi(config.botToken);
  }

  isRunning(): boolean {
    return this.running;
  }

  /** Verify the token and start the polling loop. Throws if the token is bad. */
  async start(): Promise<void> {
    if (this.running) return;
    const me = await this.api.getMe();
    this.running = true;
    this.abort = new AbortController();

    // Drop any backlog accumulated while the connector was down: a fresh poll
    // with offset 0 would otherwise replay every pending message (potentially
    // days old) to the agent as if just sent. A zero-timeout getUpdates returns
    // the pending batch immediately; we advance past it without handling it.
    try {
      const backlog = await this.api.getUpdates(0, 0, this.abort.signal);
      for (const u of backlog) {
        this.offset = Math.max(this.offset, u.update_id + 1);
      }
      if (backlog.length > 0) {
        this.logger.info(
          { dropped: backlog.length },
          "Skipped Telegram backlog accumulated while offline"
        );
      }
    } catch (err) {
      // Non-fatal: if draining fails we still start; the loop will catch up.
      this.logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "Failed to drain Telegram backlog on start"
      );
    }

    this.logger.info(
      { bot: me.username ?? me.first_name, botId: me.id },
      "Telegram remote-control connector started"
    );
    this.loopPromise = this.pollLoop();
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    this.abort?.abort();
    await this.loopPromise?.catch(() => {});
    this.logger.info({}, "Telegram remote-control connector stopped");
  }

  private async pollLoop(): Promise<void> {
    while (this.running) {
      try {
        const updates = await this.api.getUpdates(
          this.offset,
          LONG_POLL_TIMEOUT_SECONDS,
          this.abort?.signal
        );
        for (const update of updates) {
          this.offset = Math.max(this.offset, update.update_id + 1);
          // Don't await — handle messages concurrently so a slow agent reply
          // doesn't stall polling. Errors are logged inside the handler.
          void this.handleUpdate(update);
        }
      } catch (err) {
        if (!this.running) break; // aborted during shutdown
        this.logger.error(
          { err: err instanceof Error ? err.message : String(err) },
          "Telegram getUpdates failed; backing off"
        );
        await sleep(ERROR_BACKOFF_MS);
      }
    }
  }

  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    const message = update.message ?? update.edited_message;
    if (!message?.text) return; // ignore non-text (stickers, media, etc.)
    try {
      await this.handleMessage(message);
    } catch (err) {
      this.logger.error(
        {
          err: err instanceof Error ? err.message : String(err),
          chatId: message.chat.id,
        },
        "Failed to handle Telegram message"
      );
    }
  }

  private async handleMessage(message: TelegramMessage): Promise<void> {
    const chatId = String(message.chat.id);
    const text = (message.text ?? "").trim();
    if (!text) return;

    // Deny-by-default access control.
    if (!isChatAllowed(this.config, chatId)) {
      this.logger.warn(
        { chatId, from: message.from?.username },
        "Rejected Telegram message from non-allowed chat"
      );
      await this.api.sendMessage(
        chatId,
        "⛔ This chat is not authorized to control agents. Ask an admin to add your chat id: " +
          chatId
      );
      return;
    }

    const agentDid = resolveAgentForChat(this.config, chatId);
    if (!agentDid) {
      await this.api.sendMessage(
        chatId,
        "⚠️ No agent is configured for this chat. Ask an admin to set a default agent."
      );
      return;
    }

    await this.api.sendChatAction(chatId, "typing");

    const reply = await this.askAgent(agentDid, chatId, text);
    await this.api.sendMessage(
      chatId,
      reply || "(the agent returned an empty response)"
    );
  }

  /**
   * Send the user's text to the agent and collect the full streamed reply.
   * Resolves with the assembled assistant text, or an error sentence on
   * failure/timeout so the user always gets feedback.
   */
  private askAgent(
    agentDid: string,
    chatId: string,
    text: string
  ): Promise<string> {
    return new Promise<string>((resolve) => {
      // One stable conversation per chat keeps agent-side context.
      const conversationId = `tg:${chatId}`;
      const messages: ChatMessageEntry[] = [{ role: "user", content: text }];
      let buffer = "";
      let settled = false;

      const finish = (value: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };

      const timer = setTimeout(() => {
        finish(
          buffer ||
            "⏱️ The agent did not respond in time. It may be busy or offline."
        );
      }, REPLY_TIMEOUT_MS);

      const sent = this.wsServer.sendChatToAgent(
        agentDid,
        conversationId,
        messages,
        (payload: WSChatResponsePayload) => {
          if (payload.error) {
            finish(`⚠️ Agent error: ${payload.error}`);
            return;
          }
          // Skip the model's internal reasoning; send only the answer.
          if (payload.chunk && !payload.thinking) {
            buffer += payload.chunk;
          }
          if (payload.done) {
            finish(buffer);
          }
        },
        undefined,
        { stream: true }
      );

      if (!sent) {
        finish(
          `🔌 The target agent is not connected right now (${agentDid.slice(0, 16)}…).`
        );
      }
    });
  }
}

/** Generate an opaque id (kept for callers that need a fresh conversation). */
export function newConversationId(): string {
  return randomBytes(16).toString("hex");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
