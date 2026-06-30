"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { useAdminWS } from "@/hooks/useAdminWS";
import {
  Bot,
  Send,
  Trash2,
  Loader2,
  WifiOff,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toolApprovalsClient } from "@/lib/api/ts-rest/client";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  thinkingContent?: string;
}

interface PendingApproval {
  requestId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: "pending" | "submitting" | "approved" | "rejected";
}

function shortDid(did: string): string {
  if (!did) return "unknown";
  if (did.length <= 24) return did;
  return `did:…${did.slice(-8)}`;
}

export default function ChatPage() {
  const { agents: agentsState, connected: wsConnected } = useAdminWS();
  const onlineAgents = agentsState.agents.filter((a) => a.online && a.did);

  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>(
    []
  );
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || !selectedAgent || isStreaming) return;

      const userMsg: ChatMessage = { role: "user", content: text.trim() };
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
          `/api/agents/${encodeURIComponent(selectedAgent)}/chat-sessions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: updatedMessages }),
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

        // Add placeholder assistant message
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
      } catch (err: any) {
        if (err.name === "AbortError") return;
        setError(err.message || "Failed to send message");
        // Remove empty assistant message on error
        setMessages((prev) =>
          prev[prev.length - 1]?.role === "assistant" &&
          !prev[prev.length - 1]?.content
            ? prev.slice(0, -1)
            : prev
        );
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [messages, selectedAgent, isStreaming]
  );

  const clearChat = () => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setErrorCode(null);
    setIsStreaming(false);
    setPendingApprovals([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full">
      {/* Header bar */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-neutral-200 bg-background-100">
        <h1 className="text-lg font-semibold text-foreground whitespace-nowrap">
          Chat
        </h1>

        {/* Agent selector */}
        <select
          value={selectedAgent}
          onChange={(e) => {
            setSelectedAgent(e.target.value);
            clearChat();
          }}
          className="bg-background border border-neutral-200 rounded-md px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary min-w-[200px]"
        >
          <option value="">Select an agent…</option>
          {onlineAgents.map((a) => (
            <option key={a.did} value={a.did}>
              {a.name} ({shortDid(a.did)})
            </option>
          ))}
        </select>

        {!wsConnected && (
          <span className="text-xs text-danger">WS disconnected</span>
        )}

        <div className="flex-1" />

        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="flex items-center gap-1.5 text-sm text-foreground-500 hover:text-danger transition-colors"
          >
            <Trash2 size={14} />
            Clear
          </button>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {!selectedAgent && (
          <div className="flex flex-col items-center justify-center h-full text-foreground-500 gap-3">
            <Bot size={48} strokeWidth={1} />
            <p className="text-sm">Select an online agent to start chatting</p>
            {onlineAgents.length === 0 && (
              <p className="text-xs text-danger">No agents online</p>
            )}
          </div>
        )}

        {selectedAgent && messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-foreground-500 gap-2">
            <Bot size={40} strokeWidth={1} />
            <p className="text-sm">Send a message to start the conversation</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[70%] rounded-lg px-4 py-2.5 text-sm leading-relaxed prose prose-sm prose-invert max-w-none ${
                msg.role === "user"
                  ? "bg-primary/20 text-foreground prose-headings:text-foreground prose-p:m-0 prose-ul:m-0 prose-ol:m-0 prose-li:m-0 prose-code:text-foreground prose-code:bg-white/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-white/10 prose-pre:border prose-pre:border-primary/30 prose-pre:text-foreground"
                  : "bg-foreground-400 text-foreground prose-headings:text-foreground prose-p:m-0 prose-ul:m-0 prose-ol:m-0 prose-li:m-0 prose-code:text-foreground prose-code:bg-background prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-background prose-pre:border prose-pre:border-neutral-200 prose-pre:text-foreground"
              }`}
            >
              {msg.role === "assistant" && msg.thinkingContent && (
                <ChatThinkingBlock
                  content={msg.thinkingContent}
                  isStreaming={isStreaming && i === messages.length - 1}
                />
              )}
              {msg.content ? (
                <ReactMarkdown
                  components={{
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
                            ? "bg-white/10 text-foreground"
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
                            ? "bg-white/10 border-primary/30 text-foreground"
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
                            ? "border-primary/50"
                            : "border-neutral-200"
                        }`}
                      >
                        {children}
                      </blockquote>
                    ),
                    a: ({ children, href }) => (
                      <a
                        href={href}
                        className="text-primary-700 underline hover:text-primary-300"
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
              ) : null}
              {msg.role === "assistant" && !msg.content && isStreaming && (
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
              )}
            </div>
          </div>
        ))}

        {pendingApprovals.map((a) => (
          <ChatToolApprovalCard
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
                const result = await toolApprovalsClient.respond({
                  body: { requestId: a.requestId, approved },
                });
                if (result.status !== 200) throw new Error("Request failed");
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

        {error && <ChatErrorBanner message={error} code={errorCode} />}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      {selectedAgent && (
        <div className="px-6 py-3 border-t border-neutral-200 bg-background-100">
          <div className="flex items-end gap-3 max-w-4xl mx-auto">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
              rows={1}
              className="flex-1 resize-none bg-background border border-neutral-200 rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-foreground-500 focus:outline-none focus:ring-1 focus:ring-primary"
              disabled={isStreaming}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isStreaming}
              className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/80 transition-colors"
            >
              {isStreaming ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Send size={18} />
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChatThinkingBlock({
  content,
  isStreaming,
}: {
  content: string;
  isStreaming: boolean;
}) {
  return (
    <details className="mb-2 text-xs border border-neutral-200/50 rounded-lg overflow-hidden">
      <summary className="px-3 py-1.5 cursor-pointer select-none flex items-center gap-1.5 bg-background-100/50 hover:bg-background-100 transition-colors list-none text-foreground-500">
        {isStreaming ? (
          <span className="animate-pulse">Thinking…</span>
        ) : (
          <span>View reasoning</span>
        )}
      </summary>
      <pre className="whitespace-pre-wrap font-mono text-xs text-foreground-500 bg-background-100 p-3 m-0 leading-relaxed">
        {content}
      </pre>
    </details>
  );
}

function ChatToolApprovalCard({
  approval,
  onRespond,
}: {
  approval: PendingApproval;
  onRespond: (approved: boolean) => Promise<void>;
}) {
  const isDone =
    approval.status === "approved" || approval.status === "rejected";
  const isSubmitting = approval.status === "submitting";
  return (
    <div className="mx-auto max-w-[70%] rounded-xl border border-warning-500/30 bg-warning-950/20 p-3 text-sm">
      <p className="text-xs font-medium text-warning-400 mb-2">
        Tool approval required:{" "}
        <span className="font-mono">{approval.toolName}</span>
      </p>
      <details className="mb-3">
        <summary className="cursor-pointer text-xs text-foreground-500 hover:text-foreground select-none list-none">
          View arguments
        </summary>
        <pre className="mt-1 text-xs font-mono bg-background border border-neutral-200 rounded p-2 overflow-x-auto text-foreground whitespace-pre-wrap">
          {JSON.stringify(approval.args, null, 2)}
        </pre>
      </details>
      {isDone ? (
        <span
          className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
            approval.status === "approved"
              ? "bg-success-950/40 text-success-400 border border-success-500/30"
              : "bg-danger-950/40 text-danger-400 border border-danger-500/30"
          }`}
        >
          {approval.status === "approved" ? (
            <CheckCircle2 size={11} />
          ) : (
            <XCircle size={11} />
          )}
          {approval.status === "approved" ? "Approved" : "Rejected"}
        </span>
      ) : (
        <div className="flex gap-2">
          <button
            disabled={isSubmitting}
            onClick={() => onRespond(true)}
            className="flex items-center gap-1 px-3 py-1 text-xs rounded-lg bg-success-600 text-white hover:bg-success-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <CheckCircle2 size={11} />
            )}
            Approve
          </button>
          <button
            disabled={isSubmitting}
            onClick={() => onRespond(false)}
            className="flex items-center gap-1 px-3 py-1 text-xs rounded-lg bg-danger-700 text-white hover:bg-danger-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <XCircle size={11} />
            )}
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

function ChatErrorBanner({
  message,
  code,
}: {
  message: string;
  code: string | null;
}) {
  if (code === "llm_unavailable") {
    return (
      <div className="flex items-start gap-3 bg-warning-50 border border-warning-200 text-warning-700 rounded-lg px-4 py-3 text-sm">
        <WifiOff size={15} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="font-medium">LLM provider unreachable</p>
          <p className="text-xs text-warning-700 mt-0.5 break-words">
            {message}
          </p>
          <p className="text-xs text-warning-700 mt-1">
            Go to the agent&#39;s <strong>LLM Config</strong> tab to update the
            provider settings.
          </p>
        </div>
      </div>
    );
  }
  if (code === "agent_offline") {
    return (
      <div className="flex items-center gap-2 bg-danger/10 border border-danger/20 text-danger rounded-lg px-4 py-3 text-sm">
        <WifiOff size={15} className="shrink-0" />
        <span>Agent disconnected — please wait for it to reconnect</span>
      </div>
    );
  }
  return (
    <div className="text-center text-sm text-danger bg-danger/10 rounded-lg px-4 py-2">
      {message}
    </div>
  );
}
