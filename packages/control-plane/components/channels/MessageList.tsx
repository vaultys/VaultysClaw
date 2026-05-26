"use client";

import { useState, useRef, useEffect } from "react";
import { Smile, Trash2, X, MessageSquare, ChevronDown, ChevronRight } from "lucide-react";
import ReactMarkdown from "react-markdown";

function formatTime(date: string): string {
  const d = new Date(date);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

interface Message {
  id: string;
  channelId: string;
  threadId: string | null;
  authorDid: string;
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

function shortDid(did?: string): string {
  if (!did) return "unknown";
  if (did.length <= 24) return did;
  const parts = did.split(":");
  const last = parts[parts.length - 1];
  return last.length > 16 ? `…${last.slice(-12)}` : last;
}

const COMMON_EMOJIS = ["👍", "❤️", "😂", "🎉", "🔥", "👀", "😮", "😢"];

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

  const handleReaction = async (emoji: string) => {
    try {
      const response = await fetch(
        `/api/channels/${channelId}/messages/${msg.id}/reactions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emoji, add: true }),
        }
      );
      if (response.ok) onAddReaction(msg.id, emoji);
    } catch {}
    setEmojiOpen(false);
  };

  const handleDelete = async () => {
    try {
      const response = await fetch(
        `/api/channels/${channelId}/messages/${msg.id}`,
        { method: "DELETE" }
      );
      if (response.ok) onDeleteMessage(msg.id);
    } catch {}
  };

  return (
    <div
      className={`group flex gap-3 hover:bg-vc-raised px-3 py-2 rounded-lg transition ${
        isThread ? "ml-10 border-l-2 border-indigo-200 pl-3" : ""
      }`}
    >
      {/* Avatar */}
      <div
        className={`rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${
          isThread ? "w-6 h-6" : "w-8 h-8"
        } ${
          msg.authorType === "agent"
            ? "bg-gradient-to-br from-purple-400 to-indigo-600"
            : "bg-gradient-to-br from-blue-400 to-cyan-600"
        }`}
      >
        {shortDid(msg.authorDid).charAt(0).toUpperCase()}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className={`font-semibold text-vc-text ${isThread ? "text-xs" : "text-sm"}`}>
            {shortDid(msg.authorDid)}
          </span>
          {msg.authorType === "agent" && (
            <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
              agent
            </span>
          )}
          <span className="text-xs text-vc-muted">{formatTime(msg.createdAt)}</span>
        </div>
        <div className={`prose prose-sm max-w-none text-vc-text mt-0.5 break-words ${isThread ? "text-sm" : ""} [&_p]:my-0.5 [&_ul]:my-1 [&_ol]:my-1 [&_pre]:bg-vc-raised [&_pre]:rounded [&_pre]:p-2 [&_code]:text-indigo-600 [&_code]:bg-vc-raised [&_code]:px-1 [&_code]:rounded [&_a]:text-indigo-500 [&_a]:underline`}>
          <ReactMarkdown>{msg.content}</ReactMarkdown>
        </div>

        {/* Reactions */}
        {Object.keys(msg.reactions).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {Object.entries(msg.reactions).map(([emoji, dids]) => (
              <button
                key={emoji}
                onClick={() => handleReaction(emoji)}
                className="flex items-center gap-1 px-2 py-0.5 bg-vc-raised hover:bg-vc-surface rounded text-xs text-vc-text-2 transition"
              >
                <span>{emoji}</span>
                <span>{dids.length}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="opacity-0 group-hover:opacity-100 transition flex gap-1 items-start relative pt-1">
        <div className="relative">
          <button
            onClick={() => setEmojiOpen(!emojiOpen)}
            className="p-1 hover:bg-vc-raised rounded text-vc-text-2 hover:text-vc-text transition"
            title="React"
          >
            <Smile size={14} />
          </button>
          {emojiOpen && (
            <div className="absolute right-0 top-full mt-1 bg-vc-surface border border-vc-border rounded-lg shadow-lg p-2 z-10 flex gap-1">
              {COMMON_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleReaction(emoji)}
                  className="p-1 hover:bg-vc-raised rounded text-base transition"
                >
                  {emoji}
                </button>
              ))}
              <button
                onClick={() => setEmojiOpen(false)}
                className="p-1 hover:bg-vc-raised rounded text-vc-text-2"
              >
                <X size={12} />
              </button>
            </div>
          )}
        </div>
        <button
          onClick={handleDelete}
          className="p-1 hover:bg-vc-raised rounded text-vc-text-2 hover:text-red-600 transition"
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

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
        const response = await fetch(
          `/api/channels/${channelId}/messages?threadId=${parentId}`
        );
        if (response.ok) {
          const data = (await response.json()) as { messages: Message[] };
          setReplies(data.messages);
        }
      } catch {}
      setLoading(false);
    };
    fetchThread();
    // Poll thread too
    const interval = setInterval(fetchThread, 3000);
    return () => clearInterval(interval);
  }, [channelId, parentId]);

  if (loading) {
    return (
      <div className="ml-10 pl-3 border-l-2 border-indigo-100 py-1">
        <div className="text-xs text-vc-muted animate-pulse">Loading thread…</div>
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

  // Auto-expand if there are replies
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
          className="ml-14 mt-1 flex items-center gap-1.5 text-xs text-indigo-500 hover:text-indigo-700 transition"
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <MessageSquare size={12} />
          <span>{threadCount} {threadCount === 1 ? "reply" : "replies"}</span>
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

export default function MessageList({
  channelId,
  messages,
  isLoading,
  onAddReaction,
  onDeleteMessage,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtBottom = useRef(true); // start true so initial load scrolls down
  const [threadCounts, setThreadCounts] = useState<Record<string, number>>({});

  // Track whether the user is near the bottom of the scroll container
  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  };

  // Only auto-scroll when the user is already at (or near) the bottom
  useEffect(() => {
    if (isAtBottom.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Fetch thread reply counts for top-level messages
  useEffect(() => {
    if (messages.length === 0) return;

    const fetchCounts = async () => {
      const counts: Record<string, number> = {};
      await Promise.all(
        messages.map(async (msg) => {
          try {
            const response = await fetch(
              `/api/channels/${channelId}/messages?threadId=${msg.id}`
            );
            if (response.ok) {
              const data = (await response.json()) as { messages: Message[] };
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

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
      {messages.length === 0 ? (
        <div className="text-center text-vc-muted py-8">
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
