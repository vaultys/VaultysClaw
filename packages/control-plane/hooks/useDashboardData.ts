"use client";

import { useCallback, useEffect, useState } from "react";
import { daysFromNow } from "@vaultysclaw/shared";
import {
  agentsClient,
  policiesClient,
  workflowApprovalsClient,
  workflowRunsClient,
  unwrap,
} from "@/lib/api/ts-rest/client";
import type {
  AgentInfo,
  PolicyEntry,
  WorkflowApprovalItem,
  WorkflowRunWithName,
} from "@/lib/contracts";
import { useAdminWS } from "./useAdminWS";

export interface SetupBanner {
  completedCount: number;
}

/**
 * All dashboard data: agent fleet (admin WS or realm-scoped fetch), workflow
 * approvals/notifications, expired-policy renewals, recent runs, and the
 * first-run setup banner. The Dashboard view component stays presentational.
 */
export function useDashboardData(isGlobalAdmin: boolean) {
  const {
    agents: agentsState,
    registrations: pendingRegs,
    connected: wsConnected,
  } = useAdminWS();

  // ── Agents + realm membership ───────────────────────────────────────────
  // userRealmCount: null = loading, 0 = no realms (gate non-admins)
  const [userRealmCount, setUserRealmCount] = useState<number | null>(null);
  const [realmAgents, setRealmAgents] = useState<AgentInfo[] | null>(null);

  useEffect(() => {
    if (isGlobalAdmin) {
      setUserRealmCount(1); // admins have implicit access everywhere
      return;
    }
    Promise.all([
      fetch("/api/realms")
        .then((r) => (r.ok ? r.json() : { realms: [] }))
        .then((d: { realms?: unknown[] }) => d.realms?.length ?? 0),
      agentsClient
        .search()
        .then((r) => unwrap(r))
        .then((page) => page.items ?? [])
        .catch(() => [] as AgentInfo[]),
    ])
      .then(([count, items]) => {
        setUserRealmCount(count);
        setRealmAgents(items);
      })
      .catch(() => {
        setUserRealmCount(0);
        setRealmAgents([]);
      });
  }, [isGlobalAdmin]);

  const agents = isGlobalAdmin ? agentsState.agents : (realmAgents ?? []);
  const total = isGlobalAdmin ? agentsState.total : (realmAgents?.length ?? 0);
  const onlineCount = isGlobalAdmin
    ? agentsState.online
    : (realmAgents?.filter((a) => a.online).length ?? 0);

  // ── Setup banner (admin, first run) ───────────────────────────────────────
  const [setupBanner, setSetupBanner] = useState<SetupBanner | null>(null);

  useEffect(() => {
    if (!isGlobalAdmin) return;
    if (localStorage.getItem("vaultysclaw:wizardDone")) return;
    let completedCount = 0;
    try {
      const raw = localStorage.getItem("vaultysclaw:wizardState");
      if (raw) completedCount = (JSON.parse(raw).completed ?? []).length;
    } catch {
      /* ignore */
    }
    setSetupBanner({ completedCount });
  }, [isGlobalAdmin]);

  const dismissSetupBanner = useCallback(() => {
    localStorage.setItem("vaultysclaw:wizardDone", "1");
    setSetupBanner(null);
  }, []);

  // ── Approvals / notifications ─────────────────────────────────────────────
  const [approvals, setApprovals] = useState<WorkflowApprovalItem[]>([]);
  const [acting, setActing] = useState<string | null>(null);
  const [comment, setComment] = useState<Record<string, string>>({});

  const fetchApprovals = useCallback(
    () =>
      workflowApprovalsClient
        .list({ query: {} })
        .then((r) => setApprovals(unwrap(r).approvals))
        .catch(() => {}),
    []
  );

  useEffect(() => {
    fetchApprovals();
    const id = setInterval(fetchApprovals, 15_000);
    return () => clearInterval(id);
  }, [fetchApprovals]);

  const actOnApproval = useCallback(
    async (
      id: string,
      action: "approve" | "reject" | "dismiss"
    ): Promise<void> => {
      setActing(id);
      try {
        if (action === "dismiss") {
          await workflowApprovalsClient.dismiss({ params: { id } });
        } else {
          await workflowApprovalsClient[action]({
            params: { id },
            body: { comment: comment[id] || undefined },
          });
        }
        await fetchApprovals();
      } finally {
        setActing(null);
      }
    },
    [comment, fetchApprovals]
  );

  const pendingApprovals = approvals.filter(
    (a) => a.mode === "approval" && a.status === "pending"
  );
  const notifications = approvals.filter(
    (a) => a.mode === "notification" && a.status === "notified"
  );

  // ── Expired policies + renewal ────────────────────────────────────────────
  const [expiredPolicies, setExpiredPolicies] = useState<PolicyEntry[]>([]);
  const [renewingPolicy, setRenewingPolicy] = useState<PolicyEntry | null>(
    null
  );
  const [renewExpiry, setRenewExpiry] = useState("");
  const [renewSaving, setRenewSaving] = useState(false);

  const fetchExpiredPolicies = useCallback(() => {
    if (!isGlobalAdmin) return;
    policiesClient
      .list({ query: { expiredOnly: true } })
      .then((r) => setExpiredPolicies(unwrap(r).policies))
      .catch(() => {});
  }, [isGlobalAdmin]);

  useEffect(() => {
    fetchExpiredPolicies();
    const id = setInterval(fetchExpiredPolicies, 60_000);
    return () => clearInterval(id);
  }, [fetchExpiredPolicies]);

  const openRenew = useCallback((p: PolicyEntry) => {
    setRenewExpiry(daysFromNow(30));
    setRenewingPolicy(p);
  }, []);

  const confirmRenew = useCallback(async () => {
    if (!renewingPolicy) return;
    setRenewSaving(true);
    try {
      const rl =
        renewingPolicy.resourceLimits &&
        Object.keys(renewingPolicy.resourceLimits).length > 0
          ? renewingPolicy.resourceLimits
          : undefined;
      unwrap(
        await policiesClient.create({
          body: {
            agentDid: renewingPolicy.agentDid ?? undefined,
            capabilities: renewingPolicy.capabilities,
            resourceLimits: rl as Record<string, unknown> | undefined,
            expiresAt: renewExpiry
              ? new Date(renewExpiry).toISOString()
              : undefined,
          },
        })
      );
      await policiesClient.remove({ params: { id: renewingPolicy.id } });
      setRenewingPolicy(null);
      fetchExpiredPolicies();
    } finally {
      setRenewSaving(false);
    }
  }, [renewingPolicy, renewExpiry, fetchExpiredPolicies]);

  // ── Recent workflow runs ──────────────────────────────────────────────────
  const [recentRuns, setRecentRuns] = useState<WorkflowRunWithName[]>([]);

  const fetchRecentRuns = useCallback(() => {
    workflowRunsClient
      .list({ query: { pageSize: 6, sortDir: "desc" } })
      .then((r) => setRecentRuns(unwrap(r).runs))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchRecentRuns();
    const id = setInterval(fetchRecentRuns, 20_000);
    return () => clearInterval(id);
  }, [fetchRecentRuns]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const queueCount =
    pendingApprovals.length + (isGlobalAdmin ? pendingRegs.length : 0);

  return {
    wsConnected,
    pendingRegs,
    // agents
    agents,
    total,
    onlineCount,
    userRealmCount,
    // setup banner
    setupBanner,
    dismissSetupBanner,
    // approvals
    pendingApprovals,
    notifications,
    acting,
    comment,
    setComment,
    actOnApproval,
    // expired policies
    expiredPolicies,
    renewingPolicy,
    setRenewingPolicy,
    renewExpiry,
    setRenewExpiry,
    renewSaving,
    openRenew,
    confirmRenew,
    // recent runs
    recentRuns,
    // derived
    queueCount,
  };
}

export type DashboardData = ReturnType<typeof useDashboardData>;
