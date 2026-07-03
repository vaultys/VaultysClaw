"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  adminApi,
  userApi,
  unwrap,
} from "@/lib/api/ts-rest/client";
import type {
  AgentInfo,
  MapMarker,
  NetworkResponse,
  StatsTokensResponse,
} from "@/lib/contracts";
import {
  agentLabel,
  intentFeedType,
  type FeedEvent,
  type Intent,
  type WorkflowRun,
} from "../components/mission-control/types";

interface PendingRegistration {
  agentName: string;
  status: string;
}

export interface MissionControlData {
  networkStats: NetworkResponse | null;
  markers: MapMarker[];
  tokenStats: StatsTokensResponse | null;
  recentIntents: Intent[];
  workflowRuns: WorkflowRun[];
  feed: FeedEvent[];
}

/**
 * Owns every Mission Control polling loop and the derived live activity feed.
 * Keeping it out of the view component keeps the render tree declarative.
 */
export function useMissionControlData(
  agents: AgentInfo[],
  registrations: PendingRegistration[],
  lastEvent: string | null
): MissionControlData {
  const [networkStats, setNetworkStats] = useState<NetworkResponse | null>(
    null
  );
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [tokenStats, setTokenStats] = useState<StatsTokensResponse | null>(
    null
  );
  const [recentIntents, setRecentIntents] = useState<Intent[]>([]);
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRun[]>([]);
  const [feed, setFeed] = useState<FeedEvent[]>([]);

  const isFirstAgentUpdate = useRef(true);
  const seenIntentIds = useRef(new Set<string>());
  const intentsInitialized = useRef(false);
  const prevOnlineIds = useRef(new Set<string>());
  const prevLastEvent = useRef<string | null>(null);

  const pushFeed = useCallback((event: Omit<FeedEvent, "id" | "timestamp">) => {
    setFeed((prev) => [
      { ...event, id: `${Date.now()}-${Math.random()}`, timestamp: new Date() },
      ...prev.slice(0, 79),
    ]);
  }, []);

  /* ── Watch WS agent connect/disconnect ── */
  useEffect(() => {
    const currentOnline = new Set(
      agents.filter((a) => a.online).map((a) => a.did)
    );
    // On the very first update, snapshot state without emitting events — we
    // don't want a flood of "connected" for agents already online.
    if (isFirstAgentUpdate.current) {
      isFirstAgentUpdate.current = false;
      prevOnlineIds.current = currentOnline;
      return;
    }
    for (const agent of agents) {
      const wasOnline = prevOnlineIds.current.has(agent.did);
      if (agent.online && !wasOnline) {
        pushFeed({
          type: "agent_online",
          message: `${agent.name} connected`,
          detail: agent.reportedLlm?.model,
          entityId: agent.did,
          entityType: "agent",
        });
      } else if (!agent.online && wasOnline) {
        pushFeed({
          type: "agent_offline",
          message: `${agent.name} disconnected`,
          entityId: agent.did,
          entityType: "agent",
        });
      }
    }
    prevOnlineIds.current = currentOnline;
  }, [agents, pushFeed]);

  /* ── Surface new registration requests ── */
  useEffect(() => {
    if (lastEvent && lastEvent !== prevLastEvent.current) {
      if (lastEvent === "registration_requested") {
        const pending = registrations.filter((r) => r.status === "pending");
        if (pending.length > 0) {
          pushFeed({
            type: "registration",
            message: `New registration: ${pending[0].agentName}`,
          });
        }
      }
      prevLastEvent.current = lastEvent;
    }
  }, [lastEvent, registrations, pushFeed]);

  /* ── Poll map markers (30 s) ── */
  useEffect(() => {
    const fetch_ = async () => {
      try {
        setMarkers(unwrap(await adminApi.map.get({ query: {} })).markers);
      } catch {}
    };
    fetch_();
    const id = setInterval(fetch_, 30_000);
    return () => clearInterval(id);
  }, []);

  /* ── Poll token stats (30 s) ── */
  useEffect(() => {
    const fetch_ = async () => {
      try {
        setTokenStats(unwrap(await adminApi.stats.tokens()));
      } catch {}
    };
    fetch_();
    const id = setInterval(fetch_, 30_000);
    return () => clearInterval(id);
  }, []);

  /* ── Poll network stats (5 s) ── */
  useEffect(() => {
    const fetch_ = async () => {
      try {
        setNetworkStats(unwrap(await userApi.network.get({ query: {} })));
      } catch {}
    };
    fetch_();
    const id = setInterval(fetch_, 5_000);
    return () => clearInterval(id);
  }, []);

  /* ── Poll workflow runs (8 s) ── */
  useEffect(() => {
    const fetch_ = async () => {
      try {
        const data = unwrap(
          await userApi.workflowRuns.list({
            query: { pageSize: 10, sortDir: "desc" },
          })
        );
        setWorkflowRuns(data.runs ?? []);
      } catch {}
    };
    fetch_();
    const id = setInterval(fetch_, 8_000);
    return () => clearInterval(id);
  }, []);

  /* ── Poll intents → activity feed (5 s) ── */
  useEffect(() => {
    const nameFor = (did: string) => agents.find((a) => a.did === did)?.name;
    const fetch_ = async () => {
      try {
        const intents = unwrap(
          await userApi.intents.list({ query: { limit: 20 } })
        ).intents;
        setRecentIntents(intents.slice(0, 8));

        if (!intentsInitialized.current) {
          intentsInitialized.current = true;
          // Seed older intents (5+) as seen without emitting events
          intents
            .slice(5)
            .forEach((i) => seenIntentIds.current.add(i.intentId));
          // Show the most recent 5 as historical feed entries (oldest first)
          for (const intent of [...intents.slice(0, 5)].reverse()) {
            seenIntentIds.current.add(intent.intentId);
            pushFeed({
              type: intentFeedType(intent.status),
              message: `${agentLabel(intent.agentDid, nameFor)}: ${intent.action}`,
              entityId: intent.intentId,
              entityType: "intent",
            });
          }
          return;
        }
        for (const intent of [...intents].reverse()) {
          if (seenIntentIds.current.has(intent.intentId)) continue;
          seenIntentIds.current.add(intent.intentId);
          pushFeed({
            type: intentFeedType(intent.status),
            message: `${agentLabel(intent.agentDid, nameFor)}: ${intent.action}`,
          });
        }
      } catch {}
    };
    fetch_();
    const id = setInterval(fetch_, 5_000);
    return () => clearInterval(id);
  }, [agents, pushFeed]);

  return {
    networkStats,
    markers,
    tokenStats,
    recentIntents,
    workflowRuns,
    feed,
  };
}
