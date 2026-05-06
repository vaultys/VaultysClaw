import { useState, useRef, useEffect } from "react";
import { useChat } from "../hooks/useChat";
import type { ChatItem, ChatMessage, ToolCallEvent, ChatSession } from "../types";

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${
          isUser
            ? "bg-accent-emphasis text-white"
            : "bg-canvas-subtle border border-border-muted text-fg"
        }`}
      >
        {msg.content || (
          <span className="inline-flex gap-1 items-center text-fg-muted">
            <span className="w-1.5 h-1.5 bg-fg-muted rounded-full animate-pulse" />
            <span className="w-1.5 h-1.5 bg-fg-muted rounded-full animate-pulse [animation-delay:0.2s]" />
            <span className="w-1.5 h-1.5 bg-fg-muted rounded-full animate-pulse [animation-delay:0.4s]" />
          </span>
        )}
      </div>
    </div>
  );
}

function ToolCallBubble({ event }: { event: ToolCallEvent }) {
  const [expanded, setExpanded] = useState(false);
  const hasResult = event.result !== undefined;

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] w-full">
        <div
          className={`rounded-lg border text-xs font-mono overflow-hidden ${
            hasResult
              ? "border-border-muted bg-canvas"
              : "border-info/40 bg-[#0d1b2a] animate-pulse"
          }`}
        >
          <div
            className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-canvas-subtle"
            onClick={() => setExpanded((p) => !p)}
          >
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${hasResult ? "bg-success" : "bg-info animate-pulse"}`} />
            <span className="text-fg-muted text-[10px] uppercase tracking-wide">Tool</span>
            <code className="text-accent">{event.toolName}</code>
            <span className="ml-auto text-fg-dim text-[10px]">{expanded ? "▲" : "▼"}</span>
          </div>

          {expanded && (
            <div className="border-t border-border-muted divide-y divide-border-muted">
              {Object.keys(event.args).length > 0 && (
                <div className="px-3 py-2">
                  <p className="text-[10px] text-fg-muted uppercase tracking-wide mb-1">Args</p>
                  <pre className="text-[11px] text-fg-muted whitespace-pre-wrap">
                    {JSON.stringify(event.args, null, 2)}
                  </pre>
                </div>
              )}
              {hasResult && (
                <div className="px-3 py-2">
                  <p className="text-[10px] text-fg-muted uppercase tracking-wide mb-1">Result</p>
                  <pre className="text-[11px] text-success whitespace-pre-wrap max-h-40 overflow-y-auto">
                    {typeof event.result === "string"
                      ? event.result
                      : JSON.stringify(event.result, null, 2)}
                  </pre>
                </div>
              )}
              {!hasResult && (
                <div className="px-3 py-1.5">
                  <p className="text-[10px] text-info">Running…</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChatItemRow({ item }: { item: ChatItem }) {
  if (item.kind === "message") return <MessageBubble msg={item.msg} />;
  return <ToolCallBubble event={item.event} />;
}

function SessionList({
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
    <div className="flex flex-col h-full border-r border-border-muted bg-canvas-subtle w-44 flex-shrink-0">
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-border-muted">
        <span className="text-[10px] font-bold text-fg-muted uppercase tracking-widest">History</span>
        <button
          onClick={onNew}
          title="New chat"
          className="text-[11px] text-accent hover:text-accent-emphasis transition-colors font-medium"
        >
          + New
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 && (
          <p className="text-fg-dim text-[10px] text-center mt-4 px-2">No history yet</p>
        )}
        {sessions.map((s) => (
          <div
            key={s.id}
            className={`group flex items-center gap-1 px-2 py-1.5 cursor-pointer border-b border-border-muted/50 ${
              activeSessionId === s.id
                ? "bg-accent-emphasis/10 border-l-2 border-l-accent"
                : "hover:bg-canvas"
            }`}
            onClick={() => onSelect(s.id)}
          >
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-fg truncate leading-tight">
                {s.title ?? "Untitled"}
              </p>
              <p className="text-[9px] text-fg-dim">
                {s.messageCount} msg · {s.source}
              </p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
              className="opacity-0 group-hover:opacity-100 text-fg-dim hover:text-danger text-[10px] transition-opacity"
              title="Delete session"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ChatPanel() {
  const {
    items, isStreaming, error, sendMessage,
    sessions, activeSessionId, loadSession, startNewSession, refreshSessions,
  } = useChat();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items]);

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    sendMessage(input);
    setInput("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDelete = async (sessionId: string) => {
    await fetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
    if (activeSessionId === sessionId) startNewSession();
    await refreshSessions();
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <SessionList
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelect={loadSession}
        onNew={startNewSession}
        onDelete={handleDelete}
      />

      {/* Chat area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-canvas-subtle border-b border-border-muted flex-shrink-0">
          <span className="text-[11px] font-bold text-fg-muted uppercase tracking-widest">
            {activeSessionId ? "Continuing session" : "New chat"}
          </span>
          {items.length > 0 && (
            <button
              onClick={startNewSession}
              className="text-[10px] text-fg-dim hover:text-danger transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {/* Items */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
          {items.length === 0 && (
            <p className="text-fg-dim text-xs text-center mt-8">
              Send a message to chat with this agent. Tool calls will appear inline.
            </p>
          )}
          {items.map((item, i) => (
            <ChatItemRow key={i} item={item} />
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="px-3 py-1.5 bg-danger-emphasis text-danger text-xs border-t border-border-muted">
            {error}
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2 p-2 border-t border-border-muted bg-canvas-subtle flex-shrink-0">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isStreaming ? "Waiting for response…" : "Type a message…"}
            disabled={isStreaming}
            className="flex-1 bg-canvas border border-border rounded-md px-3 py-1.5 text-sm text-fg placeholder:text-fg-dim outline-none focus:border-accent disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
            className="px-3 py-1.5 bg-accent-emphasis text-white text-xs font-medium rounded-md hover:bg-accent transition-colors disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
