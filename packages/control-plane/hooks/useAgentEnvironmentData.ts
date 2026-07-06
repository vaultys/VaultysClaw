"use client";

import { useEffect, useState } from "react";
import {
  agentsClient,
  knowledgeClient,
  policiesClient,
  unwrap,
} from "@/lib/api/ts-rest/client";
import type {
  GraphData,
  KnowledgeSource,
} from "@/components/graph/agent-environment/types";

/** Fetch the peers, policies and knowledge sources backing the env graph. */
export function useAgentEnvironmentData(agentId: string) {
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [agentsRes, policiesRes, knowledgeRes] = await Promise.all([
          agentsClient.search(),
          policiesClient.list({ query: { agentDid: agentId } }),
          knowledgeClient.list({ query: { agentDid: agentId } }),
        ]);
        if (cancelled) return;
        setData({
          agents: (unwrap(agentsRes).items ?? []).filter(
            (a) => a.did !== agentId
          ),
          policies: unwrap(policiesRes).policies,
          knowledge: unwrap(knowledgeRes).sources as unknown as KnowledgeSource[],
        });
      } catch (e) {
        if (!cancelled)
          setErr(e instanceof Error ? e.message : "Failed to load graph data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  return { data, loading, err };
}
