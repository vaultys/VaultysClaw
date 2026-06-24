"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, UserMinus, Plus, Bot, User, Search, X } from "lucide-react";
import {
  shortDid,
  getInitials,
  type ChannelMember,
} from "@vaultysclaw/shared";
import { agentsClient, channelsClient, unwrap } from "@/lib/api/ts-rest/client";
import { AgentInfo } from "@/lib/contracts";

interface UserRecord {
  did: string;
  name: string | null;
  email: string | null;
}

interface MemberListProps {
  channelId: string;
}

const ROLE_STYLES: Record<string, string> = {
  owner: "text-warning-600",
  moderator: "text-primary-600",
  member: "text-foreground-500",
};

export default function MemberList({ channelId }: MemberListProps) {
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [usersAccessible, setUsersAccessible] = useState(true);

  // Add-member form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addType, setAddType] = useState<"agent" | "user">("agent");
  const [searchQuery, setSearchQuery] = useState("");
  const [agentResults, setAgentResults] = useState<AgentInfo[]>([]);
  const [userResults, setUserResults] = useState<UserRecord[]>([]);
  const [allUsers, setAllUsers] = useState<UserRecord[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedDid, setSelectedDid] = useState("");
  const [selectedName, setSelectedName] = useState(""); // for display in input after pick
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [removeError, setRemoveError] = useState<string | null>(null);

  // ── Fetch members ────────────────────────────────────────────────────────────
  const fetchMembers = useCallback(async () => {
    try {
      setIsLoading(true);
      const { members } = unwrap(
        await channelsClient.getOne({ params: { id: channelId } })
      );
      setMembers(members);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch members");
    } finally {
      setIsLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // ── Users list for the add-member search (admin-only — graceful fallback) ───
  useEffect(() => {
    fetch("/api/users?pageSize=100")
      .then(async (r) => {
        if (!r.ok) {
          setUsersAccessible(false);
          return;
        }
        const d = (await r.json()) as { users?: UserRecord[] };
        setAllUsers(d.users ?? []);
      })
      .catch(() => setUsersAccessible(false));
  }, []);

  // ── Resolve display name for a member (resolved server-side) ────────────────
  function resolveName(member: ChannelMember): {
    primary: string;
    secondary: string;
  } {
    const name = member.memberName;
    return {
      primary: name ?? shortDid(member.memberDid),
      secondary: name ? shortDid(member.memberDid) : "",
    };
  }

  // ── Agent search (debounced) ──────────────────────────────────────────────────
  useEffect(() => {
    if (addType !== "agent") {
      setAgentResults([]);
      return;
    }
    if (!searchQuery.trim()) {
      setAgentResults([]);
      return;
    }

    const t = setTimeout(async () => {
      setIsSearching(true);
      try {
        const agents = unwrap(
          await agentsClient.search({ query: { search: searchQuery } })
        ).items;

        setAgentResults(agents);
      } catch {
        /* ignore */
      } finally {
        setIsSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [searchQuery, addType]);

  // ── User search (client-side filter against already-fetched list) ─────────────
  useEffect(() => {
    if (addType !== "user") {
      setUserResults([]);
      return;
    }
    if (!searchQuery.trim()) {
      setUserResults(allUsers.slice(0, 8));
      return;
    }
    const q = searchQuery.toLowerCase();
    setUserResults(
      allUsers
        .filter(
          (u) =>
            u.name?.toLowerCase().includes(q) ||
            u.email?.toLowerCase().includes(q) ||
            u.did.toLowerCase().includes(q)
        )
        .slice(0, 8)
    );
  }, [searchQuery, addType, allUsers]);

  // Show all users when form opens in user mode (before typing)
  useEffect(() => {
    if (showAddForm && addType === "user" && !searchQuery) {
      setUserResults(allUsers.slice(0, 8));
    }
  }, [showAddForm, addType, allUsers, searchQuery]);

  // ── Add member ────────────────────────────────────────────────────────────────
  const handleAddMember = async () => {
    if (!selectedDid) return;
    setIsAdding(true);
    setAddError(null);

    try {
      const { member } = unwrap(
        await channelsClient.addMember({
          params: { id: channelId },
          body: { memberDid: selectedDid, memberType: addType },
        })
      );
      setMembers((prev) => [...prev, member]);
      resetForm();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setIsAdding(false);
    }
  };

  function resetForm() {
    setShowAddForm(false);
    setSearchQuery("");
    setSelectedDid("");
    setSelectedName("");
    setAgentResults([]);
    setUserResults([]);
    setAddError(null);
  }

  // ── Remove member ─────────────────────────────────────────────────────────────
  const handleRemoveMember = async (
    member: ChannelMember,
    displayName: string
  ) => {
    if (!confirm(`Remove "${displayName}" from this channel?`)) return;

    try {
      setRemoveError(null);
      unwrap(
        await channelsClient.removeMember({
          params: { id: channelId, memberDid: member.memberDid },
        })
      );
      setMembers((prev) =>
        prev.filter((m) => m.memberDid !== member.memberDid)
      );
    } catch (err) {
      setRemoveError(
        err instanceof Error ? err.message : "Failed to remove member"
      );
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 size={20} className="animate-spin text-foreground-500" />
      </div>
    );
  }

  const suggestions = addType === "agent" ? agentResults : userResults;
  const alreadyMemberDids = new Set(members.map((m) => m.memberDid));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Add Member form ─────────────────────────────────────────────────── */}
      {showAddForm ? (
        <div className="border-b border-neutral-200 p-3 space-y-2">
          {/* Type picker */}
          <div className="flex gap-1 p-1 bg-background rounded-lg">
            {(["agent", "user"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setAddType(t);
                  setSearchQuery("");
                  setSelectedDid("");
                  setSelectedName("");
                  setAgentResults([]);
                  setUserResults(t === "user" ? allUsers.slice(0, 8) : []);
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition ${
                  addType === t
                    ? "bg-background-100 text-foreground shadow-sm border border-neutral-200"
                    : "text-foreground-500 hover:text-foreground"
                }`}
              >
                {t === "agent" ? <Bot size={13} /> : <User size={13} />}
                {t === "agent" ? "Agent" : "User"}
              </button>
            ))}
          </div>

          {/* Search input */}
          {addType === "user" && !usersAccessible ? (
            /* Fallback: raw DID input when not admin */
            <div className="space-y-1">
              <input
                type="text"
                placeholder="Paste user DID (did:…)"
                value={selectedDid}
                onChange={(e) => {
                  setSelectedDid(e.target.value);
                  setSelectedName(e.target.value);
                }}
                className="w-full px-3 py-2 text-sm bg-background border border-neutral-200 rounded-lg text-foreground placeholder-foreground-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <p className="text-xs text-foreground-500">
                User search requires admin access.
              </p>
            </div>
          ) : (
            /* Searchable dropdown */
            <div className="relative">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-500 pointer-events-none"
                />
                <input
                  type="text"
                  placeholder={
                    selectedName
                      ? selectedName
                      : addType === "agent"
                        ? "Search agents…"
                        : "Search users…"
                  }
                  value={selectedDid ? selectedName : searchQuery}
                  onChange={(e) => {
                    if (selectedDid) {
                      // Clear selection if user edits
                      setSelectedDid("");
                      setSelectedName("");
                    }
                    setSearchQuery(e.target.value);
                  }}
                  className="w-full pl-8 pr-8 py-2 text-sm bg-background border border-neutral-200 rounded-lg text-foreground placeholder-foreground-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  autoFocus
                />
                {isSearching && (
                  <Loader2
                    size={13}
                    className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-foreground-500"
                  />
                )}
                {selectedDid && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDid("");
                      setSelectedName("");
                      setSearchQuery("");
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-500 hover:text-foreground"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              {/* Suggestions */}
              {!selectedDid && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-background-100 border border-neutral-200 rounded-lg shadow-xl z-20 overflow-hidden max-h-52 overflow-y-auto">
                  {(suggestions as (AgentInfo | UserRecord)[]).map((item) => {
                    const agentItem = item as AgentInfo;
                    const userItem = item as UserRecord;
                    const did = item.did;
                    const label =
                      addType === "agent"
                        ? agentItem.name
                        : (userItem.name ?? userItem.email ?? shortDid(did));
                    const sub =
                      addType === "agent"
                        ? shortDid(did)
                        : userItem.name && userItem.email
                          ? userItem.email
                          : shortDid(did);
                    const already = alreadyMemberDids.has(did);

                    return (
                      <button
                        key={did}
                        type="button"
                        disabled={already}
                        onClick={() => {
                          setSelectedDid(did);
                          setSelectedName(label);
                          setSearchQuery("");
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition ${
                          already
                            ? "opacity-40 cursor-not-allowed"
                            : "hover:bg-background-200"
                        }`}
                      >
                        {/* Avatar */}
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${
                            addType === "agent"
                              ? "bg-gradient-to-br from-secondary-500 to-primary-600"
                              : "bg-gradient-to-br from-primary-500 to-primary-600"
                          }`}
                        >
                          {getInitials(label)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {label}
                          </p>
                          <p className="text-xs text-foreground-500 truncate">
                            {sub}
                          </p>
                        </div>
                        {already && (
                          <span className="text-xs text-foreground-500 flex-shrink-0">
                            already member
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {addError && <p className="text-xs text-danger-600">{addError}</p>}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleAddMember}
              disabled={isAdding || !selectedDid}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition"
            >
              {isAdding ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} />
              )}
              {isAdding ? "Adding…" : "Add"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-3 py-2 text-sm bg-background-200 hover:bg-background-100 text-foreground rounded-lg border border-neutral-200 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="p-3 border-b border-neutral-200">
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm rounded-lg transition font-medium"
          >
            <Plus size={14} />
            Add Member
          </button>
        </div>
      )}
      {/* ── Error banners ────────────────────────────────────────────────────── */}
      {(error || removeError) && (
        <div className="mx-3 mt-3 p-2 bg-danger-50 border border-danger-200 text-danger-700 text-xs rounded-lg">
          {error ?? removeError}
        </div>
      )}
      {/* ── Member list ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {members.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-4 text-center">
            <p className="text-sm text-foreground-500">No members yet.</p>
            <button
              onClick={() => setShowAddForm(true)}
              className="text-xs text-primary-600 hover:underline"
            >
              Add the first member
            </button>
          </div>
        ) : (
          <ul className="p-3 space-y-1">
            {members.map((member) => {
              const { primary, secondary } = resolveName(member);
              const initials = getInitials(primary);
              const isAgent = member.memberType === "agent";

              return (
                <li
                  key={member.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-background-200 transition group"
                >
                  {/* Avatar */}
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${
                      isAgent
                        ? "bg-gradient-to-br from-secondary-500 to-primary-600"
                        : "bg-gradient-to-br from-primary-500 to-primary-600"
                    }`}
                  >
                    {initials ||
                      (isAgent ? <Bot size={14} /> : <User size={14} />)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-medium text-foreground truncate">
                        {primary}
                      </span>
                      {isAgent && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary-100 text-secondary-700 font-medium flex-shrink-0">
                          bot
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {secondary && (
                        <span className="text-xs text-foreground-500 truncate">
                          {secondary}
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wide ${
                        ROLE_STYLES[member.role] ?? "text-foreground-500"
                      }`}
                    >
                      {member.role}
                    </span>
                  </div>

                  {/* Remove button */}
                  <button
                    onClick={() => handleRemoveMember(member, primary)}
                    className="opacity-0 group-hover:opacity-100 transition p-1.5 hover:bg-danger-100 text-foreground-500 hover:text-danger-600 rounded-lg flex-shrink-0"
                    title={`Remove ${primary}`}
                  >
                    <UserMinus size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
