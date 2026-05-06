import { useState, useCallback, useRef, useEffect } from "react";
import type { ChatMessage, ChatItem, ToolCallEvent, ChatSession } from "../types";

export interface UseChatResult {
  items: ChatItem[];
  isStreaming: boolean;
  error: string | null;
  sendMessage: (text: string) => void;
  clearHistory: () => void;
  /** Flat messages array (user + assistant only) for sending to the API. */
  messages: ChatMessage[];
  // Session management
  sessions: ChatSession[];
  activeSessionId: string | null;
  loadSession: (sessionId: string) => Promise<void>;
  startNewSession: () => void;
  refreshSessions: () => Promise<void>;
}

export function useChat(): UseChatResult {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const messages: ChatMessage[] = items
    .filter((it): it is Extract<ChatItem, { kind: "message" }> => it.kind === "message")
    .map((it) => it.msg);

  const refreshSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/sessions");
      if (!res.ok) return;
      const data = await res.json() as { sessions: ChatSession[] };
      setSessions(data.sessions);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => { refreshSessions(); }, [refreshSessions]);

  const loadSession = useCallback(async (sessionId: string) => {
    if (isStreaming) return;
    try {
      const res = await fetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}`);
      if (!res.ok) return;
      const data = await res.json() as { messages: Array<{ role: string; content: string }> };
      const loadedItems: ChatItem[] = data.messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          kind: "message" as const,
          msg: { role: m.role as "user" | "assistant", content: m.content },
        }));
      setItems(loadedItems);
      setActiveSessionId(sessionId);
      setError(null);
    } catch { /* non-fatal */ }
  }, [isStreaming]);

  const startNewSession = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setItems([]);
    setError(null);
    setIsStreaming(false);
    setActiveSessionId(null);
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;

      setError(null);

      const userMsg: ChatMessage = { role: "user", content: trimmed };
      const newMessages: ChatMessage[] = [...messages, userMsg];

      setItems((prev) => [...prev, { kind: "message", msg: userMsg }]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      const pendingToolCalls = new Map<string, ToolCallEvent>();

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: newMessages,
            ...(activeSessionId ? { conversationId: activeSessionId } : {}),
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string };
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let assistantText = "";

        setItems((prev) => [...prev, { kind: "message", msg: { role: "assistant", content: "" } }]);

        let buffer = "";
        let eventType = "message";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
              continue;
            }
            if (!line.startsWith("data: ")) {
              if (line === "") eventType = "message";
              continue;
            }
            const payload = line.slice(6);
            if (payload === "[DONE]") { eventType = "message"; continue; }

            try {
              const parsed = JSON.parse(payload) as Record<string, unknown>;

              if (eventType === "session") {
                if (typeof parsed.conversationId === "string") {
                  setActiveSessionId(parsed.conversationId);
                }
                eventType = "message";
                continue;
              }

              if (eventType === "tool_call") {
                const tc: ToolCallEvent = {
                  toolCallId: parsed.toolCallId as string,
                  toolName: parsed.toolName as string,
                  args: (parsed.args ?? {}) as Record<string, unknown>,
                };
                pendingToolCalls.set(tc.toolCallId, tc);
                setItems((prev) => [...prev, { kind: "tool_call", event: tc }]);
                eventType = "message";
                continue;
              }

              if (eventType === "tool_result") {
                const toolCallId = parsed.toolCallId as string;
                const tc = pendingToolCalls.get(toolCallId);
                if (tc) {
                  const updated = { ...tc, result: parsed.result };
                  pendingToolCalls.set(toolCallId, updated);
                  setItems((prev) =>
                    prev.map((it) =>
                      it.kind === "tool_call" && it.event.toolCallId === toolCallId
                        ? { kind: "tool_call", event: updated }
                        : it
                    )
                  );
                }
                eventType = "message";
                continue;
              }

              if (parsed.error) throw new Error(parsed.error as string);
              if (parsed.text) {
                assistantText += parsed.text as string;
                setItems((prev) => {
                  const copy = [...prev];
                  const lastIdx = copy.length - 1;
                  const last = copy[lastIdx];
                  if (last?.kind === "message" && last.msg.role === "assistant") {
                    copy[lastIdx] = { kind: "message", msg: { role: "assistant", content: assistantText } };
                  }
                  return copy;
                });
              }
              eventType = "message";
            } catch (e) {
              if (e instanceof Error && e.message !== "Unexpected end of JSON input") throw e;
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setItems((prev) => {
          const last = prev[prev.length - 1];
          if (last?.kind === "message" && last.msg.role === "assistant" && !last.msg.content) {
            return prev.slice(0, -1);
          }
          return prev;
        });
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
        // Refresh sessions list in background
        refreshSessions().catch(() => {});
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, isStreaming, activeSessionId, refreshSessions],
  );

  const clearHistory = useCallback(() => {
    startNewSession();
  }, [startNewSession]);

  return {
    items, messages, isStreaming, error, sendMessage, clearHistory,
    sessions, activeSessionId, loadSession, startNewSession, refreshSessions,
  };
}
