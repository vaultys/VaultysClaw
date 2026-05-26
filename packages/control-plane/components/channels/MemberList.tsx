"use client";

import { useState, useEffect } from "react";
import { Loader2, UserMinus, Plus } from "lucide-react";

interface ChannelMember {
  id: string;
  channelId: string;
  memberDid: string;
  memberType: "user" | "agent";
  role: "member" | "moderator" | "owner";
  joinedAt: string;
  invitedBy: string | null;
}

interface MemberListProps {
  channelId: string;
}

function shortDid(did?: string): string {
  if (!did) return "unknown";
  if (did.length <= 24) return did;
  return `did:…${did.slice(-8)}`;
}

interface Agent {
  did: string;
  name: string;
}

export default function MemberList({ channelId }: MemberListProps) {
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [agentSearchResults, setAgentSearchResults] = useState<Agent[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [newMemberDid, setNewMemberDid] = useState("");
  const [newMemberType, setNewMemberType] = useState<"user" | "agent">("agent");
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/channels/${channelId}`);

        if (!response.ok) {
          throw new Error("Failed to fetch members");
        }

        const data = (await response.json()) as { members: ChannelMember[] };
        setMembers(data.members);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch members");
      } finally {
        setIsLoading(false);
      }
    };

    fetchMembers();
  }, [channelId]);

  useEffect(() => {
    if (!searchQuery.trim() || newMemberType !== "agent") {
      setAgentSearchResults([]);
      return;
    }

    const searchAgents = async () => {
      try {
        setIsSearching(true);
        const response = await fetch(
          `/api/agents/search?q=${encodeURIComponent(searchQuery)}`
        );

        if (response.ok) {
          const data = (await response.json()) as { agents: Agent[] };
          setAgentSearchResults(data.agents);
        }
      } catch (err) {
        console.error("Failed to search agents:", err);
      } finally {
        setIsSearching(false);
      }
    };

    const debounce = setTimeout(searchAgents, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery, newMemberType]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newMemberDid.trim()) {
      setAddError("Member DID is required");
      return;
    }

    setIsAdding(true);
    setAddError(null);

    try {
      const response = await fetch(`/api/channels/${channelId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberDid: newMemberDid.trim(),
          memberType: newMemberType,
        }),
      });

      if (!response.ok) {
        const data = (await response.json()) as any;
        throw new Error(data.error || "Failed to add member");
      }

      const data = (await response.json()) as { member: ChannelMember };
      setMembers([...members, data.member]);
      setNewMemberDid("");
      setShowAddForm(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveMember = async (memberDid: string) => {
    if (!confirm(`Remove ${shortDid(memberDid)} from channel?`)) {
      return;
    }

    try {
      setRemoveError(null);
      const response = await fetch(`/api/channels/${channelId}/members/${memberDid}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = (await response.json()) as any;
        throw new Error(data.error || "Failed to remove member");
      }

      setMembers(members.filter((m) => m.memberDid !== memberDid));
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : "Failed to remove member");
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case "owner":
        return "text-red-400";
      case "moderator":
        return "text-blue-400";
      default:
        return "text-slate-400";
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 size={20} className="animate-spin text-vc-muted" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Add Member Form */}
      {!showAddForm && (
        <div className="border-b border-vc-divider p-3">
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-vc-accent hover:bg-vc-accent-hover text-white text-sm rounded-lg transition"
          >
            <Plus size={14} />
            Add Member
          </button>
        </div>
      )}

      {showAddForm && (
        <div className="border-b border-vc-divider p-3 space-y-2">
          <form onSubmit={handleAddMember} className="space-y-2">
            <div className="flex gap-2">
              <select
                value={newMemberType}
                onChange={(e) => {
                  setNewMemberType(e.target.value as "user" | "agent");
                  setSearchQuery("");
                  setNewMemberDid("");
                }}
                className="flex-1 px-2 py-1 text-sm bg-vc-surface border border-vc-divider rounded text-vc-text focus:outline-none focus:border-vc-accent"
                disabled={isAdding}
              >
                <option value="user">User</option>
                <option value="agent">Agent</option>
              </select>
            </div>

            {newMemberType === "agent" ? (
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search agents by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-2 py-1 text-sm bg-vc-surface border border-vc-divider rounded text-vc-text placeholder-vc-text-2 focus:outline-none focus:border-vc-accent"
                  disabled={isAdding}
                />
                {isSearching && (
                  <div className="absolute right-2 top-1.5">
                    <Loader2 size={14} className="animate-spin text-vc-muted" />
                  </div>
                )}
                {agentSearchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-vc-surface border border-vc-divider rounded shadow-lg z-10">
                    {agentSearchResults.map((agent) => (
                      <button
                        key={agent.did}
                        type="button"
                        onClick={() => {
                          setNewMemberDid(agent.did);
                          setSearchQuery(agent.name);
                        }}
                        className="w-full text-left px-2 py-1.5 text-sm hover:bg-vc-bg text-vc-text border-b border-vc-divider last:border-b-0"
                      >
                        <div className="font-medium">{agent.name}</div>
                        <div className="text-xs text-vc-text-2">{shortDid(agent.did)}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <input
                type="text"
                placeholder="User DID (did:...)"
                value={newMemberDid}
                onChange={(e) => setNewMemberDid(e.target.value)}
                className="w-full px-2 py-1 text-sm bg-vc-surface border border-vc-divider rounded text-vc-text placeholder-vc-text-2 focus:outline-none focus:border-vc-accent"
                disabled={isAdding}
              />
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isAdding || !newMemberDid}
                className="flex-1 px-3 py-1 text-sm bg-vc-accent hover:bg-vc-accent-hover text-white rounded disabled:opacity-50"
              >
                {isAdding ? "Adding..." : "Add"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setAddError(null);
                  setSearchQuery("");
                  setNewMemberDid("");
                }}
                className="px-3 py-1 text-sm bg-vc-surface hover:bg-vc-bg text-vc-text rounded"
              >
                Cancel
              </button>
            </div>
            {addError && (
              <p className="text-red-600 text-xs">{addError}</p>
            )}
          </form>
        </div>
      )}

      {/* Members List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {error && (
          <div className="text-red-600 text-sm p-2 bg-red-50 rounded">
            {error}
          </div>
        )}
        {removeError && (
          <div className="text-red-600 text-sm p-2 bg-red-50 rounded">
            {removeError}
          </div>
        )}

        {members.length === 0 ? (
          <p className="text-vc-text-2 text-sm">No members</p>
        ) : (
          members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between p-2 hover:bg-vc-surface rounded-lg transition group"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {shortDid(member.memberDid).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-vc-text truncate">
                    {shortDid(member.memberDid)}
                  </p>
                  <p
                    className={`text-xs ${getRoleColor(member.role)} font-medium`}
                  >
                    {member.role}
                  </p>
                </div>
                {member.memberType === "agent" && (
                  <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded flex-shrink-0">
                    bot
                  </span>
                )}
              </div>

              <button
                onClick={() => handleRemoveMember(member.memberDid)}
                className="opacity-0 group-hover:opacity-100 transition p-1 hover:bg-vc-bg rounded text-vc-text-2 hover:text-red-600"
                title="Remove member"
              >
                <UserMinus size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
