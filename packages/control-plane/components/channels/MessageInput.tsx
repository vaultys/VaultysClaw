"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2 } from "lucide-react";
import { shortDid } from "@vaultysclaw/shared";
import {
  userApi,
  unwrap,
} from "@/lib/api/ts-rest/client";

interface Member {
  memberDid: string;
  memberName?: string | null;
  memberType: "user" | "agent";
  role: string;
}

interface Suggestion {
  did: string;
  name: string;
  type: "user" | "agent";
}

interface MessageInputProps {
  channelId: string;
  members?: Member[];
  onMessageSent?: (() => void) | null;
}

export default function MessageInput({
  channelId,
  members = [],
  onMessageSent,
}: MessageInputProps) {
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // @mention autocomplete state
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number>(-1);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Auto-resize textarea ──────────────────────────────────────────────────────
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [content]);

  // ── Build suggestion list matching the current @query ─────────────────────────
  // Display names are resolved server-side (memberName); fall back to short DID.
  const updateSuggestions = useCallback(
    (query: string) => {
      const q = query.toLowerCase();
      const results: Suggestion[] = [];

      for (const m of members) {
        const name = m.memberName ?? shortDid(m.memberDid);

        if (
          q === "" ||
          name.toLowerCase().includes(q) ||
          m.memberDid.toLowerCase().includes(q)
        ) {
          results.push({ did: m.memberDid, name, type: m.memberType });
        }
      }

      setSuggestions(results.slice(0, 6));
      setSelectedSuggestion(0);
    },
    [members]
  );

  // ── Detect @mention trigger as user types ─────────────────────────────────────
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursor = e.target.selectionStart ?? val.length;
    setContent(val);

    const textBeforeCursor = val.slice(0, cursor);
    const match = textBeforeCursor.match(/@([\w\-.]*)$/);

    if (match) {
      setMentionStart(cursor - match[0].length);
      setMentionQuery(match[1]);
      updateSuggestions(match[1]);
    } else {
      setMentionQuery(null);
      setSuggestions([]);
    }
  };

  // ── Insert selected suggestion ────────────────────────────────────────────────
  const insertMention = (suggestion: Suggestion) => {
    const before = content.slice(0, mentionStart);
    const after = content.slice(
      textareaRef.current?.selectionStart ??
        mentionStart + (mentionQuery?.length ?? 0) + 1
    );
    // Use a slug-safe name: replace spaces with dashes
    const safeName = suggestion.name.replace(/\s+/g, "-");
    const inserted = `@${safeName} `;
    const newContent = before + inserted + after;
    setContent(newContent);
    setSuggestions([]);
    setMentionQuery(null);

    setTimeout(() => {
      if (textareaRef.current) {
        const pos = before.length + inserted.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(pos, pos);
      }
    }, 0);
  };

  // ── Keyboard navigation ───────────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedSuggestion((s) => Math.min(s + 1, suggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedSuggestion((s) => Math.max(s - 1, 0));
        return;
      }
      if ((e.key === "Tab" || e.key === "Enter") && mentionQuery !== null) {
        e.preventDefault();
        insertMention(suggestions[selectedSuggestion]);
        return;
      }
      if (e.key === "Escape") {
        setSuggestions([]);
        setMentionQuery(null);
        return;
      }
    }

    // Send on Cmd/Ctrl+Enter
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      void handleSendMessage();
    }
  };

  // ── Send message ──────────────────────────────────────────────────────────────
  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!content.trim() || isLoading) return;

    try {
      setIsLoading(true);
      setError(null);
      setSuggestions([]);

      unwrap(
        await userApi.channels.postMessage({
          params: { id: channelId },
          body: { content: content.trim() },
        })
      );

      setContent("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      if (typeof onMessageSent === "function") onMessageSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setIsLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="border-t border-neutral-200 bg-background-100 px-6 py-4">
      {error && (
        <div className="mb-2 px-3 py-2 bg-danger-50 border border-danger-200 text-danger-700 text-sm rounded-lg">
          {error}
        </div>
      )}

      <form onSubmit={handleSendMessage} className="relative flex gap-3">
        {/* @mention suggestion dropdown */}
        {suggestions.length > 0 && (
          <div className="absolute bottom-full left-0 mb-2 w-72 bg-background-100 border border-neutral-200 rounded-xl shadow-2xl overflow-hidden z-20">
            <div className="px-3 py-2 text-xs font-medium text-foreground-500 border-b border-neutral-200 bg-background-200">
              Members — ↑↓ navigate · Tab/Enter to pick · Esc to close
            </div>
            {suggestions.map((s, i) => {
              const isSelected = i === selectedSuggestion;
              const badgeClass = isSelected
                ? "bg-white/20 text-white"
                : s.type === "agent"
                  ? "bg-secondary-100 text-secondary-700"
                  : "bg-primary-100 text-primary-700";
              return (
                <button
                  key={s.did}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertMention(s);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition ${
                    isSelected
                      ? "bg-primary-600 text-white"
                      : "hover:bg-background-200 text-foreground"
                  }`}
                >
                  {/* Avatar */}
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${
                      s.type === "agent"
                        ? "bg-gradient-to-br from-secondary-500 to-primary-600"
                        : "bg-gradient-to-br from-primary-500 to-primary-600"
                    }`}
                  >
                    {s.name.charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-sm truncate block">
                      @{s.name}
                    </span>
                  </div>

                  {/* Type badge */}
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${badgeClass}`}
                  >
                    {s.type === "agent" ? "bot" : "user"}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={
            members.length > 0
              ? "Message… (@ to mention · ⌘↵ to send)"
              : "Message… (⌘↵ to send)"
          }
          className="flex-1 bg-background border border-neutral-200 rounded-xl px-4 py-2.5 text-foreground placeholder-foreground-500 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none leading-relaxed"
          rows={1}
        />

        {/* Send button */}
        <button
          type="submit"
          disabled={!content.trim() || isLoading}
          className="self-end p-2.5 bg-primary-600 hover:bg-primary-500 disabled:bg-foreground-500 disabled:cursor-not-allowed rounded-xl transition text-white"
          title="Send (⌘↵)"
        >
          {isLoading ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Send size={18} />
          )}
        </button>
      </form>
    </div>
  );
}
