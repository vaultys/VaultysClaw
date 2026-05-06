import { useState, useRef, useEffect } from "react";
import { useChat } from "../hooks/useChat";
import type { ChatMessage } from "../types";

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${isUser
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

export default function ChatPanel() {
  const { messages, isStreaming, error, sendMessage, clearHistory } = useChat();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-canvas-subtle border-b border-border-muted flex-shrink-0">
        <span className="text-[11px] font-bold text-fg-muted uppercase tracking-widest">
          Chat
        </span>
        {messages.length > 0 && (
          <button
            onClick={clearHistory}
            className="text-[10px] text-fg-dim hover:text-danger transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-fg-dim text-xs text-center mt-8">
            Send a message to chat with this agent.
          </p>
        )}
        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} />
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
  );
}
