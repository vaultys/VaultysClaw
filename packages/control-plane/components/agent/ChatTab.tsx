"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Bot, Send, Trash2, Loader2 } from "lucide-react";
import type { ChatMessageEntry, ChatSession } from "@vaultysclaw/shared";
import {
  userApi,
  unwrap,
} from "@/lib/api/ts-rest/client";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolApprovalCard } from "./ToolApprovalCard";
import { AgentChatErrorBanner } from "./AgentChatErrorBanner";
import type { PendingApproval } from "./chat-types";

export function ChatTab({
  agentId,
  agentName,
  online,
}: {
  agentId: string;
  agentName: string;
  online: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessageEntry[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>(
    []
  );
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    setMessages([]);
    setActiveSessionId(null);
    setSessions([]);
    setError(null);
  }, [agentId]);

  const fetchSessions = useCallback(async () => {
    const { sessions } = unwrap(
      await userApi.agents.getChatSessions({ params: { did: agentId } })
    );
    setSessions(sessions ?? []);
  }, [agentId]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const loadSession = useCallback(
    async (sessionId: string) => {
      try {
        const { messages } = unwrap(
          await userApi.agents.getSessionMessages({
            params: { did: agentId, sessionId },
          })
        );
        setMessages(
          (messages ?? [])
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            }))
        );
        setActiveSessionId(sessionId);
        setError(null);
      } catch {
        /* non-fatal */
      }
    },
    [agentId]
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming || !online) return;

      const userMsg: ChatMessageEntry = { role: "user", content: text.trim() };
      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);
      setInput("");
      setError(null);
      setErrorCode(null);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(
          `/api/agents/${encodeURIComponent(agentId)}/chat-sessions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: updatedMessages,
              sessionId: activeSessionId ?? undefined,
            }),
            signal: controller.signal,
          }
        );

        if (!res.ok) {
          const errBody = (await res
            .json()
            .catch(() => ({ error: "Request failed" }))) as {
            error?: string;
            errorCode?: string;
          };
          setErrorCode(errBody.errorCode ?? null);
          throw new Error(errBody.error || `HTTP ${res.status}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response stream");

        const decoder = new TextDecoder();
        let assistantContent = "";
        let currentThinkingContent = "";
        setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

        let buffer = "";
        let eventType = "message";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
              continue;
            }
            if (!line.startsWith("data: ")) {
              if (line === "") eventType = "message";
              continue;
            }
            const data = line.slice(6);
            if (data === "[DONE]") break;
            try {
              const parsed = JSON.parse(data);
              if (eventType === "session") {
                if (typeof parsed.conversationId === "string")
                  setActiveSessionId(parsed.conversationId);
                eventType = "message";
                continue;
              }
              if (eventType === "tool_approval") {
                setPendingApprovals((prev) => [
                  ...prev,
                  {
                    requestId: parsed.requestId,
                    toolName: parsed.toolName,
                    args: parsed.args ?? {},
                    status: "pending" as const,
                  },
                ]);
                eventType = "message";
                continue;
              }
              if (parsed.error) {
                setErrorCode(parsed.errorCode ?? null);
                throw new Error(parsed.error);
              }
              if (parsed.text) {
                if (parsed.thinking) {
                  currentThinkingContent += parsed.text;
                } else {
                  assistantContent += parsed.text;
                }
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: "assistant",
                    content: assistantContent,
                    ...(currentThinkingContent
                      ? { thinkingContent: currentThinkingContent }
                      : {}),
                  };
                  return updated;
                });
              }
              eventType = "message";
            } catch (e) {
              if (e instanceof SyntaxError) continue;
              throw e;
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to send message");
        setMessages((prev) =>
          prev[prev.length - 1]?.role === "assistant" &&
          !prev[prev.length - 1]?.content
            ? prev.slice(0, -1)
            : prev
        );
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
        fetchSessions().catch(() => {});
      }
    },
    [messages, agentId, activeSessionId, isStreaming, online, fetchSessions]
  );

  const startNew = () => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setErrorCode(null);
    setIsStreaming(false);
    setActiveSessionId(null);
    setPendingApprovals([]);
  };

  if (!online) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-foreground-500">
        <Bot size={40} strokeWidth={1} />
        <p className="text-sm">{agentName} is offline — chat unavailable</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0">
      {/* Sessions sidebar */}
      <div className="w-44 flex-shrink-0 flex flex-col border-r border-neutral-200 bg-background-200 rounded-l-lg overflow-hidden">
        <div className="flex items-center justify-between px-2 py-2 border-b border-neutral-200">
          <span className="text-[10px] font-semibold text-foreground-500 uppercase tracking-widest">
            History
          </span>
          <button
            onClick={startNew}
            className="text-xs text-primary-400 hover:text-primary-300 transition-colors font-medium"
          >
            + New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 && (
            <p className="text-[10px] text-foreground-400 text-center mt-4 px-2">
              No past sessions
            </p>
          )}
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => loadSession(s.id)}
              className={`w-full text-left px-2 py-2 border-b border-neutral-200/50 hover:bg-background-100 transition-colors ${
                activeSessionId === s.id
                  ? "bg-primary-900/20 border-l-2 border-l-indigo-500"
                  : ""
              }`}
            >
              <p className="text-[11px] text-foreground truncate leading-tight">
                {s.title ?? "Untitled"}
              </p>
              <p className="text-[9px] text-foreground-400 mt-0.5">
                {s.messageCount} msg · {s.source}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-200 flex-shrink-0">
          <p className="text-xs text-foreground-500">
            {activeSessionId ? (
              <span>
                Session{" "}
                <span className="font-mono text-foreground-400">
                  {activeSessionId.slice(0, 8)}…
                </span>
              </span>
            ) : (
              <span>
                New conversation with{" "}
                <span className="text-foreground font-medium">{agentName}</span>
              </span>
            )}
          </p>
          {messages.length > 0 && (
            <button
              onClick={startNew}
              className="flex items-center gap-1.5 text-xs text-foreground-500 hover:text-danger-400 transition-colors"
            >
              <Trash2 size={13} />
              Clear
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-3 p-3">
          {messages.length === 0 && !isStreaming && (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-foreground-500">
              <Bot size={36} strokeWidth={1} />
              <p className="text-sm">
                Send a message to start the conversation
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] rounded-xl px-4 py-2.5 text-sm leading-relaxed prose prose-sm max-w-none ${
                  msg.role === "user"
                    ? "bg-primary-600/25 text-foreground rounded-br-sm prose-headings:text-foreground prose-p:m-0 prose-ul:m-0 prose-ol:m-0 prose-li:m-0 prose-code:text-foreground prose-code:bg-primary-950/30 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-primary-950/30 prose-pre:border prose-pre:border-primary-500/20 prose-pre:text-primary-100"
                    : "bg-background-200 border border-neutral-200 text-foreground rounded-bl-sm prose-headings:text-foreground prose-p:m-0 prose-ul:m-0 prose-ol:m-0 prose-li:m-0 prose-code:text-foreground prose-code:bg-background prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-background prose-pre:border prose-pre:border-neutral-200 prose-pre:text-foreground"
                }`}
              >
                {msg.role === "assistant" && msg.thinkingContent && (
                  <ThinkingBlock
                    content={msg.thinkingContent}
                    isStreaming={isStreaming && i === messages.length - 1}
                  />
                )}
                {msg.content ? (
                  <ReactMarkdown
                    components={{
                      strong: ({ children }) => (
                        <span className="font-semibold">{children}</span>
                      ),
                      em: ({ children }) => (
                        <span className="italic">{children}</span>
                      ),
                      p: ({ children }) => <p className="m-0">{children}</p>,
                      ul: ({ children }) => (
                        <ul className="m-0 pl-4 list-disc">{children}</ul>
                      ),
                      ol: ({ children }) => (
                        <ol className="m-0 pl-4 list-decimal">{children}</ol>
                      ),
                      li: ({ children }) => <li className="m-0">{children}</li>,
                      code: ({ children }) => (
                        <code
                          className={`px-1 py-0.5 rounded text-sm font-mono ${
                            msg.role === "user"
                              ? "bg-primary-950/30 text-primary-200"
                              : "bg-background text-foreground"
                          }`}
                        >
                          {children}
                        </code>
                      ),
                      pre: ({ children }) => (
                        <pre
                          className={`p-2 rounded text-xs overflow-x-auto my-1 border ${
                            msg.role === "user"
                              ? "bg-primary-950/30 border-primary-500/20 text-primary-100"
                              : "bg-background border-neutral-200 text-foreground"
                          }`}
                        >
                          {children}
                        </pre>
                      ),
                      h1: ({ children }) => (
                        <h1 className="text-base font-bold mt-2 mb-1">
                          {children}
                        </h1>
                      ),
                      h2: ({ children }) => (
                        <h2 className="text-sm font-bold mt-2 mb-1">
                          {children}
                        </h2>
                      ),
                      h3: ({ children }) => (
                        <h3 className="text-xs font-bold mt-1 mb-0.5">
                          {children}
                        </h3>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote
                          className={`pl-2 border-l-2 my-1 ${
                            msg.role === "user"
                              ? "border-primary-500/50"
                              : "border-neutral-200"
                          }`}
                        >
                          {children}
                        </blockquote>
                      ),
                      a: ({ children, href }) => (
                        <a
                          href={href}
                          className="text-primary-400 underline hover:text-primary-300"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {children}
                        </a>
                      ),
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                ) : (
                  msg.role === "assistant" &&
                  isStreaming && (
                    <span className="inline-flex gap-1 text-foreground-500">
                      <span
                        className="animate-bounce"
                        style={{ animationDelay: "0ms" }}
                      >
                        ·
                      </span>
                      <span
                        className="animate-bounce"
                        style={{ animationDelay: "150ms" }}
                      >
                        ·
                      </span>
                      <span
                        className="animate-bounce"
                        style={{ animationDelay: "300ms" }}
                      >
                        ·
                      </span>
                    </span>
                  )
                )}
              </div>
            </div>
          ))}

          {pendingApprovals.map((a) => (
            <ToolApprovalCard
              key={a.requestId}
              approval={a}
              onRespond={async (approved) => {
                setPendingApprovals((prev) =>
                  prev.map((x) =>
                    x.requestId === a.requestId
                      ? { ...x, status: "submitting" as const }
                      : x
                  )
                );
                try {
                  unwrap(
                    await userApi.toolApprovals.respond({
                      body: { requestId: a.requestId, approved },
                    })
                  );
                  setPendingApprovals((prev) =>
                    prev.map((x) =>
                      x.requestId === a.requestId
                        ? {
                            ...x,
                            status: approved
                              ? ("approved" as const)
                              : ("rejected" as const),
                          }
                        : x
                    )
                  );
                } catch {
                  setPendingApprovals((prev) =>
                    prev.map((x) =>
                      x.requestId === a.requestId
                        ? { ...x, status: "pending" as const }
                        : x
                    )
                  );
                }
              }}
            />
          ))}

          {error && <AgentChatErrorBanner message={error} code={errorCode} />}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-3 pb-3 pt-2 border-t border-neutral-200 flex-shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(input);
                }
              }}
              placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
              rows={1}
              disabled={isStreaming}
              className="flex-1 resize-none bg-background-200 border border-neutral-200 rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-foreground-500 focus:outline-none focus:ring-1 focus:ring-primary-500/50"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isStreaming}
              className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary-500 transition-colors"
            >
              {isStreaming ? (
                <Loader2 size={17} className="animate-spin" />
              ) : (
                <Send size={17} />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
