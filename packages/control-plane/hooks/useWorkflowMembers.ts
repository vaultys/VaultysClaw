"use client";

import { useEffect, useMemo, useState } from "react";
import { adminAgentsClient, usersClient, unwrap } from "@/lib/api/ts-rest/client";
import type { AgentInfo } from "@/lib/contracts";
import type { WorkspaceUser } from "@/components/workflow/properties/types";

const isRealWorkspace = (workspaceId: string) =>
  Boolean(workspaceId) && workspaceId !== "default";

/**
 * Fetches the agents and users of a workflow's workspace and exposes client-side
 * search filtering for both. Used by the agent / skill / user node editors.
 */
export function useWorkflowMembers(workflowWorkspaceId: string) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const [users, setUsers] = useState<WorkspaceUser[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [userLoading, setUserLoading] = useState(false);

  useEffect(() => {
    if (!isRealWorkspace(workflowWorkspaceId)) return;
    setLoading(true);
    setSearchQuery("");
    adminAgentsClient
      .search({ query: { workspace: workflowWorkspaceId } })
      .then((r) => setAgents(unwrap(r).items))
      .catch((err) => {
        console.error("Failed to fetch agents:", err);
        setAgents([]);
      })
      .finally(() => setLoading(false));
  }, [workflowWorkspaceId]);

  useEffect(() => {
    if (!isRealWorkspace(workflowWorkspaceId)) return;
    setUserLoading(true);
    setUserSearchQuery("");
    usersClient
      .search({ query: { workspace: workflowWorkspaceId } })
      .then((r) => setUsers(unwrap(r).users))
      .catch((err) => {
        console.error("Failed to fetch users:", err);
        setUsers([]);
      })
      .finally(() => setUserLoading(false));
  }, [workflowWorkspaceId]);

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
