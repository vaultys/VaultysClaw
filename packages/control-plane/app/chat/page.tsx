"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { useAdminWS } from "@/hooks/useAdminWS";
import { Bot, Send, Trash2, Loader2, WifiOff, Settings } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function shortDid(did: string): string {
  if (did.length <= 24) return did;
  return `did:…${did.slice(-8)}`;
}

export default function ChatPage() {
  const { agents: agentsState, connected: wsConnected } = useAdminWS();
  const onlineAgents = agentsState.agents.filter((a) => a.online);

  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
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
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentDid: selectedAgent, messages: updatedMessages }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({ error: "Request failed" })) as { error?: string; errorCode?: string };
          setErrorCode(errBody.errorCode ?? null);
          throw new Error(errBody.error || `HTTP ${res.status}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response stream");

        const decoder = new TextDecoder();
        let assistantContent = "";

        // Add placeholder assistant message
        setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;
            const data = trimmed.slice(6);
            if (data === "[DONE]") break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.error) {
                setErrorCode(parsed.errorCode ?? null);
                throw new Error(parsed.error);
              }
              if (parsed.text) {
                assistantContent += parsed.text;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "assistant", content: assistantContent };
                  return updated;
                });
              }
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
          prev[prev.length - 1]?.role === "assistant" && !prev[prev.length - 1]?.content
            ? prev.slice(0, -1)
            : prev,
        );
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [messages, selectedAgent, isStreaming],
  );

  const clearChat = () => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setErrorCode(null);
    setIsStreaming(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header bar */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-vc-border bg-vc-panel">
        <h1 className="text-lg font-semibold text-vc-text whitespace-nowrap">Chat</h1>

        {/* Agent selector */}
        <select
          value={selectedAgent}
          onChange={(e) => {
            setSelectedAgent(e.target.value);
            clearChat();
          }}
          className="bg-vc-bg border border-vc-border rounded-md px-3 py-1.5 text-sm text-vc-text focus:outline-none focus:ring-1 focus:ring-vc-accent min-w-[200px]"
        >
          <option value="">Select an agent…</option>
          {onlineAgents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({shortDid(a.id)})
            </option>
          ))}
        </select>

        {!wsConnected && (
          <span className="text-xs text-vc-danger">WS disconnected</span>
        )}

        <div className="flex-1" />

        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="flex items-center gap-1.5 text-sm text-vc-muted hover:text-vc-danger transition-colors"
          >
            <Trash2 size={14} />
            Clear
          </button>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {!selectedAgent && (
          <div className="flex flex-col items-center justify-center h-full text-vc-muted gap-3">
            <Bot size={48} strokeWidth={1} />
            <p className="text-sm">Select an online agent to start chatting</p>
            {onlineAgents.length === 0 && (
              <p className="text-xs text-vc-danger">No agents online</p>
            )}
          </div>
        )}

        {selectedAgent && messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-vc-muted gap-2">
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
              className={`max-w-[70%] rounded-lg px-4 py-2.5 text-sm leading-relaxed prose prose-sm prose-invert max-w-none ${msg.role === "user"
                ? "bg-vc-accent/20 text-vc-text prose-headings:text-vc-text prose-p:m-0 prose-ul:m-0 prose-ol:m-0 prose-li:m-0 prose-code:text-vc-text prose-code:bg-white/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-white/10 prose-pre:border prose-pre:border-vc-accent/30 prose-pre:text-vc-text"
                : "bg-vc-subtle text-vc-text prose-headings:text-vc-text prose-p:m-0 prose-ul:m-0 prose-ol:m-0 prose-li:m-0 prose-code:text-vc-text prose-code:bg-vc-bg prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-vc-bg prose-pre:border prose-pre:border-vc-border prose-pre:text-vc-text"
                }`}
            >
              {msg.content ? (
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p className="m-0">{children}</p>,
                    ul: ({ children }) => <ul className="m-0 pl-4 list-disc">{children}</ul>,
                    ol: ({ children }) => <ol className="m-0 pl-4 list-decimal">{children}</ol>,
                    li: ({ children }) => <li className="m-0">{children}</li>,
                    code: ({ children }) => (
                      <code className={`px-1 py-0.5 rounded text-sm font-mono ${msg.role === "user"
                          ? "bg-white/10 text-vc-text"
                          : "bg-vc-bg text-vc-text"
                        }`}>
                        {children}
                      </code>
                    ),
                    pre: ({ children }) => (
                      <pre className={`p-2 rounded text-xs overflow-x-auto my-1 border ${msg.role === "user"
                          ? "bg-white/10 border-vc-accent/30 text-vc-text"
                          : "bg-vc-bg border-vc-border text-vc-text"
                        }`}>
                        {children}
                      </pre>
                    ),
                    h1: ({ children }) => <h1 className="text-base font-bold mt-2 mb-1">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-sm font-bold mt-2 mb-1">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-xs font-bold mt-1 mb-0.5">{children}</h3>,
                    blockquote: ({ children }) => (
                      <blockquote className={`pl-2 border-l-2 my-1 ${msg.role === "user" ? "border-vc-accent/50" : "border-vc-border"
                        }`}>
                        {children}
                      </blockquote>
                    ),
                    a: ({ children, href }) => (
                      <a href={href} className="text-blue-400 underline hover:text-blue-300" target="_blank" rel="noopener noreferrer">
                        {children}
                      </a>
                    ),
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              ) : null}
              {msg.role === "assistant" && !msg.content && isStreaming && (
                <span className="inline-flex gap-1 text-vc-muted">
                  <span className="animate-bounce" style={{ animationDelay: "0ms" }}>·</span>
                  <span className="animate-bounce" style={{ animationDelay: "150ms" }}>·</span>
                  <span className="animate-bounce" style={{ animationDelay: "300ms" }}>·</span>
                </span>
              )}
            </div>
          </div>
        ))}

        {error && (
          <ChatErrorBanner message={error} code={errorCode} />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      {selectedAgent && (
        <div className="px-6 py-3 border-t border-vc-border bg-vc-panel">
          <div className="flex items-end gap-3 max-w-4xl mx-auto">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
              rows={1}
              className="flex-1 resize-none bg-vc-bg border border-vc-border rounded-lg px-4 py-2.5 text-sm text-vc-text placeholder:text-vc-muted focus:outline-none focus:ring-1 focus:ring-vc-accent"
              disabled={isStreaming}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isStreaming}
              className="flex items-center justify-center w-10 h-10 rounded-lg bg-vc-accent text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-vc-accent/80 transition-colors"
            >
              {isStreaming ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChatErrorBanner({ message, code }: { message: string; code: string | null }) {
  if (code === "llm_unavailable") {
    return (
      <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-lg px-4 py-3 text-sm">
        <WifiOff size={15} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="font-medium">LLM provider unreachable</p>
          <p className="text-xs text-amber-400/80 mt-0.5 break-words">{message}</p>
          <p className="text-xs text-amber-400/60 mt-1">Go to the agent&#39;s <strong>LLM Config</strong> tab to update the provider settings.</p>
        </div>
      </div>
    );
  }
  if (code === "agent_offline") {
    return (
      <div className="flex items-center gap-2 bg-vc-danger/10 border border-vc-danger/20 text-vc-danger rounded-lg px-4 py-3 text-sm">
        <WifiOff size={15} className="shrink-0" />
        <span>Agent disconnected — please wait for it to reconnect</span>
      </div>
    );
  }
  return (
    <div className="text-center text-sm text-vc-danger bg-vc-danger/10 rounded-lg px-4 py-2">
      {message}
    </div>
  );
}
