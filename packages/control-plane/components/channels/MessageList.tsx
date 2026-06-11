"use client";

import { useState, useRef, useEffect } from "react";
import {
  Smile,
  Trash2,
  X,
  MessageSquare,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import {
  shortDid,
  getInitials,
  COMMON_EMOJIS,
  formatTimeOnly,
} from "@vaultysclaw/shared";

interface Message {
  id: string;
  channelId: string;
  threadId: string | null;
  authorDid: string;
  authorName?: string | null;
  authorType: "user" | "agent";
  content: string;
  metadata: Record<string, any>;
  reactions: Record<string, string[]>;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

interface MessageListProps {
  channelId: string;
  messages: Message[];
  isLoading: boolean;
  onAddReaction: (messageId: string, emoji: string) => void;
  onDeleteMessage: (messageId: string) => void;
}

// ── MessageBubble ─────────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  channelId,
  onAddReaction,
  onDeleteMessage,
  isThread = false,
}: {
  msg: Message;
  channelId: string;
  onAddReaction: (id: string, emoji: string) => void;
  onDeleteMessage: (id: string) => void;
  isThread?: boolean;
}) {
  const [emojiOpen, setEmojiOpen] = useState(false);

  const displayName = msg.authorName ?? shortDid(msg.authorDid);
  const initials = getInitials(displayName);
  const isAgent = msg.authorType === "agent";

  const handleReaction = async (emoji: string) => {
    try {
      const res = await fetch(
        `/api/channels/${channelId}/messages/${msg.id}/reactions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emoji, add: true }),
        }
      );
      if (res.ok) onAddReaction(msg.id, emoji);
    } catch {}
    setEmojiOpen(false);
  };

  const handleDelete = async () => {
    try {
      const res = await fetch(`/api/channels/${channelId}/messages/${msg.id}`, {
        method: "DELETE",
      });
      if (res.ok) onDeleteMessage(msg.id);
    } catch {}
  };

  return (
    <div
      className={`group flex gap-3 hover:bg-background-200 px-3 py-2 rounded-lg transition ${
        isThread ? "ml-10 border-l-2 border-primary-200 pl-3" : ""
      }`}
    >
      {/* Avatar */}
      <div
        className={`rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${
          isThread ? "w-6 h-6" : "w-8 h-8"
        } ${
          isAgent
            ? "bg-gradient-to-br from-secondary-500 to-primary-600"
            : "bg-gradient-to-br from-primary-500 to-primary-600"
        }`}
      >
        {initials}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span
            className={`font-semibold text-foreground ${
              isThread ? "text-xs" : "text-sm"
            }`}
          >
            {displayName}
          </span>
          {isAgent && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary-100 text-secondary-700 font-medium flex-shrink-0">
              bot
            </span>
          )}
          <span className="text-xs text-foreground-500">
            {formatTimeOnly(msg.createdAt)}
          </span>
        </div>

        <div
          className={`prose prose-sm dark:prose-invert max-w-none text-foreground mt-0.5 break-words ${
            isThread ? "text-sm" : ""
          } prose-headings:text-foreground prose-strong:text-foreground [&_p]:my-0.5 [&_ul]:my-1 [&_ol]:my-1 [&_pre]:bg-background-200 [&_pre]:rounded [&_pre]:p-2 [&_code]:text-primary-600 dark:[&_code]:text-primary-400 [&_code]:bg-background-200 [&_code]:px-1 [&_code]:rounded [&_a]:text-primary-500 [&_a]:underline`}
        >
          <ReactMarkdown>{msg.content}</ReactMarkdown>
        </div>

        {/* Reactions */}
        {Object.keys(msg.reactions).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {Object.entries(msg.reactions).map(([emoji, dids]) => (
              <button
                key={emoji}
                onClick={() => handleReaction(emoji)}
                className="flex items-center gap-1 px-2 py-0.5 bg-background-200 hover:bg-background-100 rounded text-xs text-foreground-700 transition"
              >
                <span>{emoji}</span>
                <span>{dids.length}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Actions (hover) */}
      <div className="opacity-0 group-hover:opacity-100 transition flex gap-1 items-start relative pt-1 flex-shrink-0">
        <div className="relative">
          <button
            onClick={() => setEmojiOpen(!emojiOpen)}
            className="p-1 hover:bg-background-200 rounded text-foreground-700 hover:text-foreground transition"
            title="React"
          >
            <Smile size={14} />
          </button>
          {emojiOpen && (
            <div className="absolute right-0 top-full mt-1 bg-background-100 border border-neutral-200 rounded-lg shadow-lg p-2 z-10 flex gap-1">
              {COMMON_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleReaction(emoji)}
                  className="p-1 hover:bg-background-200 rounded text-base transition"
                >
                  {emoji}
                </button>
              ))}
              <button
                onClick={() => setEmojiOpen(false)}
                className="p-1 hover:bg-background-200 rounded text-foreground-700"
              >
                <X size={12} />
              </button>
            </div>
          )}
        </div>
        <button
          onClick={handleDelete}
          className="p-1 hover:bg-background-200 rounded text-foreground-700 hover:text-danger-600 dark:hover:text-danger-400 transition"
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

// ── ThreadView ────────────────────────────────────────────────────────────────

function ThreadView({
  channelId,
  parentId,
  onAddReaction,
  onDeleteMessage,
}: {
  channelId: string;
  parentId: string;
  onAddReaction: (id: string, emoji: string) => void;
  onDeleteMessage: (id: string) => void;
}) {
  const [replies, setReplies] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchThread = async () => {
      try {
        const res = await fetch(
          `/api/channels/${channelId}/messages?threadId=${parentId}`
        );
        if (res.ok) {
          const data = (await res.json()) as { messages: Message[] };
          setReplies(data.messages);
        }
      } catch {}
      setLoading(false);
    };
    fetchThread();
    const interval = setInterval(fetchThread, 3000);
    return () => clearInterval(interval);
  }, [channelId, parentId]);

  if (loading) {
    return (
      <div className="ml-10 pl-3 border-l-2 border-primary-100 py-1">
        <div className="text-xs text-foreground-500 animate-pulse">
          Loading thread…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1 mt-1">
      {replies.map((reply) => (
        <MessageBubble
          key={reply.id}
          msg={reply}
          channelId={channelId}
          onAddReaction={onAddReaction}
          onDeleteMessage={onDeleteMessage}
          isThread
        />
      ))}
    </div>
  );
}

// ── MessageWithThread ─────────────────────────────────────────────────────────

function MessageWithThread({
  msg,
  channelId,
  threadCount,
  onAddReaction,
  onDeleteMessage,
}: {
  msg: Message;
  channelId: string;
  threadCount: number;
  onAddReaction: (id: string, emoji: string) => void;
  onDeleteMessage: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (threadCount > 0) setExpanded(true);
  }, [threadCount]);

  return (
    <div>
      <MessageBubble
        msg={msg}
        channelId={channelId}
        onAddReaction={onAddReaction}
        onDeleteMessage={onDeleteMessage}
      />

      {threadCount > 0 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="ml-14 mt-1 flex items-center gap-1.5 text-xs text-primary-500 hover:text-primary-700 dark:hover:text-primary-300 transition"
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <MessageSquare size={12} />
          <span>
            {threadCount} {threadCount === 1 ? "reply" : "replies"}
          </span>
        </button>
      )}

      {expanded && (
        <ThreadView
          channelId={channelId}
          parentId={msg.id}
          onAddReaction={onAddReaction}
          onDeleteMessage={onDeleteMessage}
        />
      )}
    </div>
  );
}

// ── MessageList (root) ────────────────────────────────────────────────────────

export default function MessageList({
  channelId,
  messages,
  isLoading,
  onAddReaction,
  onDeleteMessage,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtBottom = useRef(true);
  const [threadCounts, setThreadCounts] = useState<Record<string, number>>({});

  // ── Scroll behaviour ────────────────────────────────────────────────────────
  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  };

  useEffect(() => {
    if (isAtBottom.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // ── Thread reply counts ─────────────────────────────────────────────────────
  useEffect(() => {
    if (messages.length === 0) return;

    const fetchCounts = async () => {
      const counts: Record<string, number> = {};
      await Promise.all(
        messages.map(async (msg) => {
          try {
            const res = await fetch(
              `/api/channels/${channelId}/messages?threadId=${msg.id}`
            );
            if (res.ok) {
              const data = (await res.json()) as { messages: Message[] };
              counts[msg.id] = data.messages.length;
            }
          } catch {}
        })
      );
      setThreadCounts(counts);
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, 3000);
    return () => clearInterval(interval);
  }, [messages, channelId]);

  // ── Render ──────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-6 py-4 space-y-3"
    >
      {messages.length === 0 ? (
        <div className="text-center text-foreground-500 py-8">
          <p>No messages yet. Start the conversation!</p>
          <p className="text-xs mt-2">Type @ to mention an agent</p>
        </div>
      ) : (
        messages.map((msg) => (
          <MessageWithThread
            key={msg.id}
            msg={msg}
            channelId={channelId}
            threadCount={threadCounts[msg.id] ?? 0}
            onAddReaction={onAddReaction}
            onDeleteMessage={onDeleteMessage}
          />
        ))
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
