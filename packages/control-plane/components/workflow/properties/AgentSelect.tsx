"use client";

import { Search } from "lucide-react";
import type { AgentInfo } from "@/lib/contracts";

/** Agent search box + dropdown, shared by the agent and skill node editors. */
export function AgentSelect({
  value,
  agents,
  filteredAgents,
  loading,
  searchQuery,
  setSearchQuery,
  onChange,
  emptyOptionLabel,
  showCount = false,
}: {
  value: string;
  agents: AgentInfo[];
  filteredAgents: AgentInfo[];
  loading: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onChange: (did: string, name?: string) => void;
  emptyOptionLabel: string;
  showCount?: boolean;
}) {
  return (
    <>
      <div className="relative mb-2">
        <Search
          size={14}
          className="absolute left-3 top-2.5 text-foreground-400"
        />
        <input
          type="text"
          placeholder="Search agents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-3 py-2 bg-background-100 text-foreground border border-neutral-200 rounded-md text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
      </div>
      <select
        value={value}
        onChange={(e) => {
          const selected = agents.find((a) => a.did === e.target.value);
          onChange(e.target.value, selected?.name);
        }}
        className="w-full px-3 py-2 bg-background-100 text-foreground border border-neutral-200 rounded-md text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
      >
        <option value="">{emptyOptionLabel}</option>
        {loading ? (
          <option disabled>Loading agents…</option>
        ) : filteredAgents.length === 0 ? (
          <option disabled>No agents found</option>
        ) : (
          filteredAgents.map((a) => (
            <option key={a.did} value={a.did}>
              {a.name}
              {a.online ? " 🟢" : " 🔴"}
            </option>
          ))
        )}
      </select>
      {showCount && filteredAgents.length > 0 && (
        <p className="text-xs text-foreground-400 mt-1">
          {filteredAgents.length} agent
          {filteredAgents.length !== 1 ? "s" : ""} found
        </p>
      )}
    </>
  );
}
