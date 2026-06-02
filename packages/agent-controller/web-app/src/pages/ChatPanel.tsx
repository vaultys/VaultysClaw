import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { useChat } from "../hooks/useChat";
import type { ChatItem, ChatMessage, ToolCallEvent, ChatSession } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffS = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diffS < 60) return "just now";
  if (diffS < 3600) return `${Math.floor(diffS / 60)}m ago`;
  if (diffS < 86400) return `${Math.floor(diffS / 3600)}h ago`;
  return d.toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-3 animate-slide-up ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold select-none ${isUser
          ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/30"
          : "bg-background-200 text-foreground-500 border border-neutral-200"
        }`}>
        {isUser ? "U" : "A"}
      </div>

      {/* Bubble */}
      <div className={`group relative max-w-[80%] ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words prose prose-sm prose-invert max-w-none ${isUser
            ? "bg-indigo-600/25 text-foreground border border-indigo-500/20 rounded-tr-sm prose-headings:text-indigo-300 prose-p:m-0 prose-ul:m-0 prose-ol:m-0 prose-li:m-0 prose-code:text-indigo-200 prose-code:bg-indigo-950/30 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-indigo-950/30 prose-pre:border prose-pre:border-indigo-500/20 prose-pre:text-indigo-100"
            : "bg-background-200 text-foreground border border-neutral-200 rounded-tl-sm prose-headings:text-foreground prose-p:m-0 prose-ul:m-0 prose-ol:m-0 prose-li:m-0 prose-code:text-foreground prose-code:bg-background prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-background prose-pre:border prose-pre:border-neutral-200 prose-pre:text-foreground"
          }`}>
          {msg.content ? (
            <ReactMarkdown
              components={{
                p: ({ children }) => <p className="m-0">{children}</p>,
                ul: ({ children }) => <ul className="m-0 pl-4 list-disc">{children}</ul>,
                ol: ({ children }) => <ol className="m-0 pl-4 list-decimal">{children}</ol>,
                li: ({ children }) => <li className="m-0">{children}</li>,
                code: ({ children }) => (
                  <code className={`px-1 py-0.5 rounded text-sm font-mono ${isUser
                      ? "bg-indigo-950/30 text-indigo-200"
                      : "bg-background text-foreground"
                    }`}>
                    {children}
                  </code>
                ),
                pre: ({ children }) => (
                  <pre className={`p-2 rounded text-xs overflow-x-auto my-1 border ${isUser
                      ? "bg-indigo-950/30 border-indigo-500/20 text-indigo-100"
                      : "bg-background border-neutral-200 text-foreground"
                    }`}>
                    {children}
                  </pre>
                ),
                h1: ({ children }) => <h1 className="text-base font-bold mt-2 mb-1">{children}</h1>,
                h2: ({ children }) => <h2 className="text-sm font-bold mt-2 mb-1">{children}</h2>,
                h3: ({ children }) => <h3 className="text-xs font-bold mt-1 mb-0.5">{children}</h3>,
                blockquote: ({ children }) => (
                  <blockquote className={`pl-2 border-l-2 my-1 ${isUser ? "border-indigo-500/50" : "border-neutral-200"
                    }`}>
                    {children}
                  </blockquote>
                ),
                a: ({ children, href }) => (
                  <a href={href} className={isUser ? "text-indigo-300 underline hover:text-indigo-200" : "text-blue-400 underline hover:text-blue-300"} target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                ),
              }}
            >
              {msg.content}
            </ReactMarkdown>
          ) : (
            <span className="inline-flex gap-1 items-center">
              <span className="w-1.5 h-1.5 bg-foreground-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 bg-foreground-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 bg-foreground-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tool call card
// ---------------------------------------------------------------------------

function ToolCallCard({ event }: { event: ToolCallEvent }) {
  const [expanded, setExpanded] = useState(false);
  const done = event.result !== undefined;

  return (
    <div className="flex gap-3 animate-slide-up">
      {/* Spacer aligned with avatar */}
      <div className="flex-shrink-0 w-7" />

      <div className={`flex-1 max-w-[80%] rounded-xl border text-xs font-mono overflow-hidden transition-colors ${done
          ? "border-neutral-200 bg-background-100"
          : "border-emerald-500/30 bg-emerald-500/5"
        }`}>
        {/* Header */}
        <button
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors text-left"
          onClick={() => setExpanded((p) => !p)}
        >
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${done ? "bg-emerald-400" : "bg-emerald-400 animate-pulse"}`} />
          <span className="text-[10px] text-foreground-400 uppercase tracking-widest">Tool</span>
          <code className="text-emerald-400 font-semibold">{event.toolName}</code>
          {!done && <span className="text-[10px] text-foreground-400 ml-1">Running…</span>}
          <span className="ml-auto text-foreground-400">{expanded ? "▲" : "▼"}</span>
        </button>

        {/* Expanded content */}
        {expanded && (
          <div className="border-t border-neutral-200 divide-y divide-neutral-200">
            {Object.keys(event.args).length > 0 && (
              <div className="px-3 py-2.5">
                <p className="text-[9px] text-foreground-400 uppercase tracking-widest mb-1.5">Input</p>
                <pre className="text-[11px] text-foreground-700 whitespace-pre-wrap overflow-x-auto">
                  {JSON.stringify(event.args, null, 2)}
                </pre>
              </div>
            )}
            {done && (
              <div className="px-3 py-2.5">
                <p className="text-[9px] text-foreground-400 uppercase tracking-widest mb-1.5">Output</p>
                <div className="text-[11px] text-emerald-600 dark:text-emerald-300 whitespace-pre-wrap max-h-48 overflow-y-auto prose prose-sm prose-invert max-w-none prose-headings:text-emerald-400 prose-p:m-0 prose-ul:m-0 prose-ol:m-0 prose-li:m-0 prose-code:text-emerald-200 prose-code:bg-emerald-950/30 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-emerald-950/30 prose-pre:border prose-pre:border-emerald-500/20 prose-pre:text-emerald-100">
                  {typeof event.result === "string" ? (
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <p className="m-0">{children}</p>,
                        ul: ({ children }) => <ul className="m-0 pl-4 list-disc">{children}</ul>,
                        ol: ({ children }) => <ol className="m-0 pl-4 list-decimal">{children}</ol>,
                        li: ({ children }) => <li className="m-0">{children}</li>,
                        code: ({ children }) => (
                          <code className="px-1 py-0.5 rounded text-xs font-mono bg-emerald-950/30 text-emerald-200">
                            {children}
                          </code>
                        ),
                        pre: ({ children }) => (
                          <pre className="p-2 rounded text-xs overflow-x-auto my-1 border bg-emerald-950/30 border-emerald-500/20 text-emerald-100">
                            {children}
                          </pre>
                        ),
                      }}
                    >
                      {event.result}
                    </ReactMarkdown>
                  ) : (
                    <pre className="text-[11px] font-mono whitespace-pre-wrap">
                      {JSON.stringify(event.result, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ChatItemRow({ item }: { item: ChatItem }) {
  if (item.kind === "message") return <MessageBubble msg={item.msg} />;
  return <ToolCallCard event={item.event} />;
}

// ---------------------------------------------------------------------------
// Session sidebar
// ---------------------------------------------------------------------------

function SessionSidebar({
  sessions,
  activeSessionId,
  onSelect,
  onNew,
  onDelete,
}: {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="w-52 flex-shrink-0 flex flex-col bg-background-100 border-r border-neutral-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-neutral-200">
        <span className="text-[10px] font-semibold text-foreground-500 uppercase tracking-widest">Conversations</span>
        <button
          onClick={onNew}
          className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors font-medium"
          title="New chat"
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto py-1">
        {sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center h-24 gap-1.5 text-foreground-400">
            <svg className="w-5 h-5 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-[10px]">No history yet</span>
          </div>
        )}

        {sessions.map((s) => {
          const isActive = activeSessionId === s.id;
          return (
            <div
              key={s.id}
              className={`group relative mx-1 rounded-lg mb-0.5 cursor-pointer transition-colors ${isActive
                  ? "bg-indigo-600/15 border border-indigo-500/25"
                  : "hover:bg-background-200 border border-transparent"
                }`}
              onClick={() => onSelect(s.id)}
            >
              <div className="px-3 py-2">
                <p className={`text-xs leading-snug truncate font-medium ${isActive ? "text-foreground" : "text-foreground-700"}`}>
                  {s.title ?? "Untitled conversation"}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[9px] text-foreground-400">{s.messageCount} msg</span>
                  <span className="text-[9px] text-neutral-300">·</span>
                  <span className="text-[9px] text-foreground-400">{timeLabel(s.updatedAt)}</span>
                  {s.source !== "web" && (
                    <>
                      <span className="text-[9px] text-neutral-300">·</span>
                      <span className="text-[9px] text-indigo-400/70">{s.source}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Delete button */}
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded text-foreground-400 hover:text-red-400 hover:bg-red-500/10"
                onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                title="Delete"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ agentName }: { agentName?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-foreground-400 px-6">
      <div className="w-14 h-14 rounded-2xl bg-background-200 border border-neutral-200 flex items-center justify-center">
        <svg className="w-7 h-7 text-foreground-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-foreground-700 mb-1">
          {agentName ? `Chat with ${agentName}` : "Start a conversation"}
        </p>
        <p className="text-xs text-foreground-400">Send a message below. Tool calls will appear inline.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main ChatPanel
// ---------------------------------------------------------------------------

export default function ChatPanel() {
  const {
    items, isStreaming, error, sendMessage,
    sessions, activeSessionId, loadSession, startNewSession, refreshSessions,
  } = useChat();

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isComposingRef = useRef(false);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;
    sendMessage(text);
    setInput("");
    inputRef.current?.focus();
  }, [input, isStreaming, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !isComposingRef.current) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDelete = async (sessionId: string) => {
    await fetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
    if (activeSessionId === sessionId) startNewSession();
    await refreshSessions();
  };

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  return (
    <div className="flex flex-1 h-full overflow-hidden bg-background">
      {/* Sessions sidebar */}
      <SessionSidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelect={loadSession}
        onNew={startNewSession}
        onDelete={handleDelete}
      />

      {/* Chat area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-background-100 border-b border-neutral-200 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
            <span className="text-sm font-medium text-foreground">
              {activeSessionId
                ? <span className="text-foreground-700">Session <code className="text-[11px] text-foreground-400 font-mono">{activeSessionId.slice(0, 8)}…</code></span>
                : "New conversation"
              }
            </span>
          </div>
          {items.length > 0 && (
            <button
              onClick={startNewSession}
              className="text-xs text-foreground-400 hover:text-red-400 transition-colors flex items-center gap-1"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
              Clear
            </button>
          )}
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
          {items.length === 0
            ? <EmptyState />
            : (
              <div className="space-y-4 max-w-3xl mx-auto">
                {items.map((item, i) => (
                  <ChatItemRow key={i} item={item} />
                ))}
              </div>
            )
          }
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-4 mb-2 px-3 py-2 bg-red-500/10 border border-red-500/25 rounded-lg text-xs text-red-400 flex items-center gap-2">
            <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" strokeLinecap="round" />
            </svg>
            {error}
          </div>
        )}

        {/* Input area */}
        <div className="px-4 pb-4 pt-2 flex-shrink-0">
          <div className="flex items-end gap-2 bg-background-200 border border-neutral-200 rounded-xl px-3 py-2.5 focus-within:border-indigo-500/50 transition-colors">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => { isComposingRef.current = true; }}
              onCompositionEnd={() => { isComposingRef.current = false; }}
              placeholder={isStreaming ? "Agent is responding…" : "Message the agent… (Enter to send, Shift+Enter for new line)"}
              disabled={isStreaming}
              className="flex-1 bg-transparent resize-none text-sm text-foreground placeholder:text-foreground-400 outline-none disabled:opacity-60 leading-relaxed min-h-[1.5rem]"
              style={{ maxHeight: "120px" }}
            />
            <button
              onClick={handleSend}
              disabled={isStreaming || !input.trim()}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-indigo-600 text-white disabled:opacity-35 disabled:cursor-not-allowed hover:bg-indigo-500 transition-colors"
              title="Send (Enter)"
            >
              {isStreaming ? (
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-[10px] text-foreground-400 mt-1.5 text-center">
            Shift+Enter for new line · tool calls appear inline
          </p>
        </div>
      </div>
    </div>
  );
}
