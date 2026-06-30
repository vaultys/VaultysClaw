"use client";

import { useEffect, useMemo, useState } from "react";
import { agentsClient, usersClient, unwrap } from "@/lib/api/ts-rest/client";
import type { AgentInfo } from "@/lib/contracts";
import type { RealmUser } from "@/components/workflow/properties/types";

const isRealRealm = (realmId: string) =>
  Boolean(realmId) && realmId !== "default";

/**
 * Fetches the agents and users of a workflow's realm and exposes client-side
 * search filtering for both. Used by the agent / skill / user node editors.
 */
export function useWorkflowMembers(workflowRealmId: string) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const [users, setUsers] = useState<RealmUser[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [userLoading, setUserLoading] = useState(false);

  useEffect(() => {
    if (!isRealRealm(workflowRealmId)) return;
    setLoading(true);
    setSearchQuery("");
    agentsClient
      .search({ query: { realm: workflowRealmId } })
      .then((r) => setAgents(unwrap(r).items))
      .catch((err) => {
        console.error("Failed to fetch agents:", err);
        setAgents([]);
      })
      .finally(() => setLoading(false));
  }, [workflowRealmId]);

  useEffect(() => {
    if (!isRealRealm(workflowRealmId)) return;
    setUserLoading(true);
    setUserSearchQuery("");
    usersClient
      .search({ query: { realm: workflowRealmId } })
      .then((r) => setUsers(unwrap(r).users))
      .catch((err) => {
        console.error("Failed to fetch users:", err);
        setUsers([]);
      })
      .finally(() => setUserLoading(false));
  }, [workflowRealmId]);

  const filteredAgents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.capabilities.some((cap) => cap.toLowerCase().includes(q))
    );
  }, [searchQuery, agents]);

  const filteredUsers = useMemo(() => {
    const q = userSearchQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
    );
  }, [userSearchQuery, users]);

  return {
    agents,
    filteredAgents,
    searchQuery,
    setSearchQuery,
    loading,
    users,
    filteredUsers,
    userSearchQuery,
    setUserSearchQuery,
    userLoading,
  };
}

export type WorkflowMembers = ReturnType<typeof useWorkflowMembers>;
