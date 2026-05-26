"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2 } from "lucide-react";

interface Member {
  memberDid: string;
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

function shortName(did: string): string {
  // Use the last segment of the DID as a display name fallback
  const parts = did.split(":");
  return parts[parts.length - 1].slice(0, 12);
}

export default function MessageInput({ channelId, members = [], onMessageSent }: MessageInputProps) {
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // @mention autocomplete state
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number>(-1);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const [agentNames, setAgentNames] = useState<Record<string, string>>({});

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [content]);

  // Fetch agent names for autocomplete display
  useEffect(() => {
    const agentMembers = members.filter((m) => m.memberType === "agent");
    if (agentMembers.length === 0) return;

    const fetchAgentNames = async () => {
      try {
        const response = await fetch(`/api/agents/search?q=`);
        if (response.ok) {
          const data = (await response.json()) as { agents: { did: string; name: string }[] };
          const map: Record<string, string> = {};
          for (const agent of data.agents) {
            map[agent.did] = agent.name;
          }
          setAgentNames(map);
        }
      } catch {
        // ignore
      }
    };
    fetchAgentNames();
  }, [members]);

  // Build suggestion list from members matching the current @query
  const updateSuggestions = useCallback(
    (query: string) => {
      const q = query.toLowerCase();
      const results: Suggestion[] = [];

      for (const m of members) {
        const isAgent = m.memberType === "agent";
        const name = isAgent
          ? (agentNames[m.memberDid] ?? shortName(m.memberDid))
          : shortName(m.memberDid);

        if (q === "" || name.toLowerCase().includes(q) || m.memberDid.toLowerCase().includes(q)) {
          results.push({ did: m.memberDid, name, type: m.memberType });
        }
      }

      setSuggestions(results.slice(0, 6));
      setSelectedSuggestion(0);
    },
    [members, agentNames],
  );

  // Detect @mention trigger as user types
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursor = e.target.selectionStart ?? val.length;
    setContent(val);

    // Find if cursor is inside a @mention token
    const textBeforeCursor = val.slice(0, cursor);
    const match = textBeforeCursor.match(/@([\w\-]*)$/);

    if (match) {
      setMentionStart(cursor - match[0].length);
      setMentionQuery(match[1]);
      updateSuggestions(match[1]);
    } else {
      setMentionQuery(null);
      setSuggestions([]);
    }
  };

  // Insert selected suggestion into text
  const insertMention = (suggestion: Suggestion) => {
    const before = content.slice(0, mentionStart);
    const after = content.slice(
      textareaRef.current?.selectionStart ?? mentionStart + (mentionQuery?.length ?? 0) + 1,
    );
    const inserted = `@${suggestion.name} `;
    const newContent = before + inserted + after;
    setContent(newContent);
    setSuggestions([]);
    setMentionQuery(null);

    // Restore focus and move cursor after inserted mention
    setTimeout(() => {
      if (textareaRef.current) {
        const pos = before.length + inserted.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(pos, pos);
      }
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Navigate suggestions
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
      if (e.key === "Tab" || e.key === "Enter") {
        if (mentionQuery !== null) {
          e.preventDefault();
          insertMention(suggestions[selectedSuggestion]);
          return;
        }
      }
      if (e.key === "Escape") {
        setSuggestions([]);
        setMentionQuery(null);
        return;
      }
    }

    // Send on Cmd/Ctrl+Enter
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleSendMessage();
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!content.trim() || isLoading) return;

    try {
      setIsLoading(true);
      setError(null);
      setSuggestions([]);

      const response = await fetch(`/api/channels/${channelId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim() }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to send message");
      }

      setContent("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      if (typeof onMessageSent === "function") onMessageSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="border-t border-vc-border bg-vc-surface px-6 py-4">
      {error && (
        <div className="text-red-600 text-sm mb-2 p-2 bg-red-50 rounded">
          {error}
        </div>
      )}

      <form onSubmit={handleSendMessage} className="relative flex gap-3">
        {/* @mention suggestion dropdown */}
        {suggestions.length > 0 && (
          <div className="absolute bottom-full left-0 mb-2 w-64 bg-vc-surface border border-vc-border rounded-lg shadow-lg overflow-hidden z-20">
            <div className="px-3 py-1.5 text-xs text-vc-text-2 border-b border-vc-border font-medium">
              Members — Tab or Enter to select
            </div>
            {suggestions.map((s, i) => (
              <button
                key={s.did}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(s);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition ${
                  i === selectedSuggestion
                    ? "bg-indigo-600 text-white"
                    : "hover:bg-vc-raised text-vc-text"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${
                    s.type === "agent"
                      ? "bg-gradient-to-br from-purple-400 to-indigo-600"
                      : "bg-gradient-to-br from-blue-400 to-cyan-600"
                  }`}
                >
                  {s.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-medium truncate block">@{s.name}</span>
                </div>
                {s.type === "agent" && (
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
                      i === selectedSuggestion
                        ? "bg-white/20 text-white"
                        : "bg-purple-100 text-purple-700"
                    }`}
                  >
                    bot
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Message... (type @ to mention, Cmd+Enter to send)"
          className="flex-1 bg-vc-bg border border-vc-border rounded-lg px-4 py-2 text-vc-text placeholder-vc-muted focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          rows={1}
        />

        <div className="flex gap-2 items-end">
          <button
            type="submit"
            disabled={!content.trim() || isLoading}
            className="p-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-vc-muted disabled:cursor-not-allowed rounded-lg transition text-white"
            title="Send message"
          >
            {isLoading ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <Send size={20} />
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
