/**
 * Minimal Telegram Bot API client over `fetch` — no SDK dependency.
 * Covers exactly what the remote-control connector needs: long-polling
 * `getUpdates` and `sendMessage` (with the 4096-char split Telegram requires).
 */

const TELEGRAM_API_BASE = "https://api.telegram.org";

/** Telegram caps a single message at 4096 UTF-16 code units. */
export const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

export class TelegramApi {
  constructor(private readonly token: string) {}

  private url(method: string): string {
    return `${TELEGRAM_API_BASE}/bot${this.token}/${method}`;
  }

  private async call<T>(
    method: string,
    body: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<T> {
    const res = await fetch(this.url(method), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    const data = (await res.json()) as TelegramApiResponse<T>;
    if (!data.ok) {
      throw new Error(
        `Telegram ${method} failed: ${data.error_code ?? res.status} ${data.description ?? res.statusText}`
      );
    }
    return data.result as T;
  }

  /** Verify the token works and return the bot's identity. */
  async getMe(): Promise<TelegramUser> {
    return this.call<TelegramUser>("getMe", {});
  }

  /**
   * Long-poll for updates. `offset` should be the last seen update_id + 1 so
   * Telegram marks earlier updates as confirmed. `timeout` is server-side long
   * poll seconds; the AbortSignal lets us cancel a pending poll on shutdown.
   */
  async getUpdates(
    offset: number,
    timeoutSeconds: number,
    signal?: AbortSignal
  ): Promise<TelegramUpdate[]> {
    return this.call<TelegramUpdate[]>(
      "getUpdates",
      {
        offset,
        timeout: timeoutSeconds,
        // Only message-bearing updates; ignore inline queries, etc.
        allowed_updates: ["message"],
      },
      signal
    );
  }

  /** Send a chat action (e.g. "typing") — best-effort, errors are swallowed. */
  async sendChatAction(chatId: number | string, action: string): Promise<void> {
    try {
      await this.call("sendChatAction", { chat_id: chatId, action });
    } catch {
      /* presence is best-effort */
    }
  }

  /**
   * Send text to a chat, splitting into multiple messages when it exceeds the
   * Telegram per-message limit. Splits on newline boundaries when possible to
   * avoid cutting mid-line.
   */
  async sendMessage(chatId: number | string, text: string): Promise<void> {
    const chunks = splitForTelegram(text);
    for (const chunk of chunks) {
      await this.call("sendMessage", {
        chat_id: chatId,
        text: chunk,
        disable_web_page_preview: true,
      });
    }
  }
}

/**
 * Split a long string into Telegram-sized chunks, preferring newline
 * boundaries. Falls back to a hard cut for lines longer than the limit.
 */
export function splitForTelegram(
  text: string,
  limit = TELEGRAM_MAX_MESSAGE_LENGTH
): string[] {
  if (text.length <= limit) return text.length === 0 ? [] : [text];

  const chunks: string[] = [];
  let current = "";

  for (const line of text.split("\n")) {
    // A single line longer than the limit must be hard-split.
    if (line.length > limit) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (let i = 0; i < line.length; i += limit) {
        chunks.push(line.slice(i, i + limit));
      }
      continue;
    }

    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > limit) {
      chunks.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}
