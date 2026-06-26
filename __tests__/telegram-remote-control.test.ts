/**
 * Tests for the Telegram remote-control connector:
 *   - splitForTelegram chunking (4096-char limit, newline boundaries)
 *   - config helpers: isChatAllowed (deny-by-default), resolveAgentForChat
 *   - TelegramConnector routing: allowed → sendChatToAgent → reply;
 *     disallowed → rejection; no agent → warning; offline agent → fallback.
 *
 * The connector is exercised with a real TelegramApi whose `fetch` is mocked,
 * so HTTP serialization and the getUpdates/sendMessage round-trip are covered.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  splitForTelegram,
  TELEGRAM_MAX_MESSAGE_LENGTH,
} from "../packages/control-plane/lib/remote-control/telegram-api";
import {
  isChatAllowed,
  resolveAgentForChat,
  type TelegramRemoteControlConfig,
} from "../packages/control-plane/lib/remote-control/types";
import { TelegramConnector } from "../packages/control-plane/lib/remote-control/telegram-connector";
import type { WSChatResponsePayload } from "@vaultysclaw/shared";

// ---------------------------------------------------------------------------
// splitForTelegram
// ---------------------------------------------------------------------------

describe("splitForTelegram", () => {
  it("returns empty array for empty string", () => {
    expect(splitForTelegram("")).toEqual([]);
  });

  it("returns single chunk when under the limit", () => {
    expect(splitForTelegram("hello")).toEqual(["hello"]);
  });

  it("splits long text into chunks within the limit", () => {
    const long = "x".repeat(TELEGRAM_MAX_MESSAGE_LENGTH * 2 + 10);
    const chunks = splitForTelegram(long);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(TELEGRAM_MAX_MESSAGE_LENGTH);
    }
    expect(chunks.join("")).toBe(long);
  });

  it("prefers newline boundaries when splitting", () => {
    const limit = 10;
    const text = "line1\nline2\nline3";
    const chunks = splitForTelegram(text, limit);
    // "line1\nline2" is 11 > 10, so each line lands in its own chunk groupings.
    expect(chunks.every((c) => c.length <= limit)).toBe(true);
    expect(chunks.join("\n")).toBe(text);
  });

  it("hard-splits a single line longer than the limit", () => {
    const limit = 5;
    const chunks = splitForTelegram("abcdefghij", limit);
    expect(chunks).toEqual(["abcde", "fghij"]);
  });
});

// ---------------------------------------------------------------------------
// config helpers
// ---------------------------------------------------------------------------

describe("remote-control config helpers", () => {
  const base: TelegramRemoteControlConfig = {
    enabled: true,
    botToken: "token",
    allowedChatIds: ["111", "222"],
    defaultAgentDid: "did:default",
    agentByChat: { "222": "did:special" },
  };

  it("isChatAllowed is deny-by-default", () => {
    expect(isChatAllowed(base, "111")).toBe(true);
    expect(isChatAllowed(base, "999")).toBe(false);
    expect(isChatAllowed({ ...base, allowedChatIds: [] }, "111")).toBe(false);
  });

  it("resolveAgentForChat prefers per-chat override, falls back to default", () => {
    expect(resolveAgentForChat(base, "222")).toBe("did:special");
    expect(resolveAgentForChat(base, "111")).toBe("did:default");
    expect(
      resolveAgentForChat({ ...base, defaultAgentDid: undefined }, "111")
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TelegramConnector routing (fetch mocked)
// ---------------------------------------------------------------------------

interface MockCall {
  method: string;
  body: Record<string, unknown>;
}

/**
 * Build a fetch mock that:
 *  - answers getMe with a fake bot
 *  - serves a queue of getUpdates batches, then long-poll-empties forever
 *  - records sendMessage / sendChatAction calls
 */
function makeFetchMock(updateBatches: unknown[][]) {
  const calls: MockCall[] = [];
  let batchIdx = 0;

  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const method = String(_url).split("/").pop() ?? "";
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ method, body });

    const ok = (result: unknown) =>
      ({ json: async () => ({ ok: true, result }) }) as unknown as Response;

    if (method === "getMe") {
      return ok({ id: 1, is_bot: true, first_name: "Bot", username: "test_bot" });
    }
    if (method === "getUpdates") {
      // The startup backlog drain polls with timeout 0; return empty so the
      // test's messages are delivered to the real long-poll loop instead of
      // being silently skipped as backlog.
      if (body.timeout === 0) {
        return ok([]);
      }
      if (batchIdx < updateBatches.length) {
        return ok(updateBatches[batchIdx++]);
      }
      // Subsequent polls simulate Telegram's server-side long poll by resolving
      // empty after a short delay — otherwise the loop would busy-spin.
      await new Promise((r) => setTimeout(r, 50));
      return ok([]);
    }
    // sendMessage, sendChatAction
    return ok(true);
  });

  return { fetchMock, calls };
}

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function makeUpdate(updateId: number, chatId: number, text: string) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      chat: { id: chatId, type: "private" },
      date: Date.now(),
      text,
      from: { id: chatId, is_bot: false, first_name: "User" },
    },
  };
}

/** Wait until `predicate` is true or time out. */
async function waitFor(predicate: () => boolean, ms = 2000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > ms) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}

const cfg: TelegramRemoteControlConfig = {
  enabled: true,
  botToken: "test-token",
  allowedChatIds: ["100"],
  defaultAgentDid: "did:agent:1",
  agentByChat: {},
};

describe("TelegramConnector", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    logger.info.mockClear();
    logger.warn.mockClear();
    logger.error.mockClear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("routes an allowed message to the agent and replies with the streamed text", async () => {
    const { fetchMock, calls } = makeFetchMock([
      [makeUpdate(1, 100, "hello agent")],
    ]);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    // Fake WS server: immediately streams a two-chunk reply, then done.
    const sendChatToAgent = vi.fn(
      (
        agentDid: string,
        conversationId: string,
        _messages: unknown,
        onChunk: (p: WSChatResponsePayload) => void
      ) => {
        expect(agentDid).toBe("did:agent:1");
        expect(conversationId).toBe("tg:100");
        onChunk({ conversationId, chunk: "Hi " });
        onChunk({ conversationId, chunk: "there" });
        onChunk({ conversationId, done: true });
        return true;
      }
    );
    const wsServer = { sendChatToAgent } as never;

    const connector = new TelegramConnector(cfg, wsServer, logger);
    await connector.start();

    await waitFor(() => calls.some((c) => c.method === "sendMessage"));
    await connector.stop();

    expect(sendChatToAgent).toHaveBeenCalledOnce();
    const sent = calls.find((c) => c.method === "sendMessage");
    expect(sent?.body.chat_id).toBe("100");
    expect(sent?.body.text).toBe("Hi there");
  });

  it("rejects a message from a non-allowed chat without calling the agent", async () => {
    const { fetchMock, calls } = makeFetchMock([
      [makeUpdate(1, 999, "let me in")],
    ]);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const sendChatToAgent = vi.fn(() => true);
    const wsServer = { sendChatToAgent } as never;

    const connector = new TelegramConnector(cfg, wsServer, logger);
    await connector.start();
    await waitFor(() => calls.some((c) => c.method === "sendMessage"));
    await connector.stop();

    expect(sendChatToAgent).not.toHaveBeenCalled();
    const sent = calls.find((c) => c.method === "sendMessage");
    expect(String(sent?.body.text)).toContain("not authorized");
  });

  it("tells the user when the target agent is offline", async () => {
    const { fetchMock, calls } = makeFetchMock([
      [makeUpdate(1, 100, "you there?")],
    ]);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    // sendChatToAgent returns false → agent not connected.
    const sendChatToAgent = vi.fn(() => false);
    const wsServer = { sendChatToAgent } as never;

    const connector = new TelegramConnector(cfg, wsServer, logger);
    await connector.start();
    await waitFor(() => calls.some((c) => c.method === "sendMessage"));
    await connector.stop();

    const sent = calls.find((c) => c.method === "sendMessage");
    expect(String(sent?.body.text)).toContain("not connected");
  });

  it("warns and prompts when no agent is configured for the chat", async () => {
    const { fetchMock, calls } = makeFetchMock([
      [makeUpdate(1, 100, "hi")],
    ]);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const sendChatToAgent = vi.fn(() => true);
    const wsServer = { sendChatToAgent } as never;

    const noAgentCfg = { ...cfg, defaultAgentDid: undefined };
    const connector = new TelegramConnector(noAgentCfg, wsServer, logger);
    await connector.start();
    await waitFor(() => calls.some((c) => c.method === "sendMessage"));
    await connector.stop();

    expect(sendChatToAgent).not.toHaveBeenCalled();
    const sent = calls.find((c) => c.method === "sendMessage");
    expect(String(sent?.body.text)).toContain("No agent is configured");
  });

  it("drains startup backlog without routing it to the agent", async () => {
    // A backlog update returned by the zero-timeout drain poll. The mock serves
    // [] for timeout===0, so to simulate real backlog we serve it on a poll the
    // drain consumes. Here we assert: a stale update returned by the drain is
    // skipped — i.e. an update_id we advance past is never re-processed.
    const calls: MockCall[] = [];
    let drained = false;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const method = String(_url).split("/").pop() ?? "";
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      calls.push({ method, body });
      const ok = (result: unknown) =>
        ({ json: async () => ({ ok: true, result }) }) as unknown as Response;
      if (method === "getMe")
        return ok({ id: 1, is_bot: true, first_name: "Bot" });
      if (method === "getUpdates") {
        if (body.timeout === 0) {
          drained = true;
          // Backlog: one stale message that must NOT reach the agent.
          return ok([makeUpdate(5, 100, "stale backlog message")]);
        }
        // Real poll must request offset past the drained update (6).
        expect(body.offset).toBe(6);
        await new Promise((r) => setTimeout(r, 50));
        return ok([]);
      }
      return ok(true);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const sendChatToAgent = vi.fn(() => true);
    const wsServer = { sendChatToAgent } as never;

    const connector = new TelegramConnector(cfg, wsServer, logger);
    await connector.start();
    await waitFor(() => drained && calls.some((c) => c.body.offset === 6));
    await connector.stop();

    expect(sendChatToAgent).not.toHaveBeenCalled();
    expect(calls.some((c) => c.method === "sendMessage")).toBe(false);
  });
});
