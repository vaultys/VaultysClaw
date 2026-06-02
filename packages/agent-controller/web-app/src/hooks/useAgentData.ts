import { useState, useEffect } from "react";
import type { AgentInfo, LogEntry, IntentEntry } from "../types";

const MAX_LOGS = 200;
const MAX_INTENTS = 100;

export interface AgentData {
  info: AgentInfo | null;
  logs: LogEntry[];
  intents: IntentEntry[];
  sseConnected: boolean;
}

export function useAgentData(): AgentData {
  const [info, setInfo] = useState<AgentInfo | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [intentMap, setIntentMap] = useState<Map<string, IntentEntry>>(
    new Map()
  );
  const [sseConnected, setSseConnected] = useState(false);

  useEffect(() => {
    // Fetch initial snapshot
    fetch("/api/info")
      .then((r) => r.json())
      .then((d: AgentInfo) => {
        setInfo(d);
        if (d.recentLogs) setLogs(d.recentLogs.slice(-MAX_LOGS));
        if (d.recentIntents) {
          const m = new Map<string, IntentEntry>();
          for (const i of d.recentIntents) m.set(i.intentId, i);
          setIntentMap(m);
        }
      })
      .catch(console.error);

    const es = new EventSource("/api/events");
    es.onopen = () => setSseConnected(true);
    es.onerror = () => setSseConnected(false);

    es.addEventListener("info", (e: MessageEvent) => {
      try {
        setInfo(JSON.parse(e.data) as AgentInfo);
      } catch {
        /* ignore */
      }
    });

    es.addEventListener("log", (e: MessageEvent) => {
      try {
        const entry = JSON.parse(e.data) as LogEntry;
        setLogs((prev) => [...prev.slice(-(MAX_LOGS - 1)), entry]);
      } catch {
        /* ignore */
      }
    });

    es.addEventListener("status_changed", (e: MessageEvent) => {
      try {
        const { status } = JSON.parse(e.data) as {
          status: AgentInfo["status"];
        };
        setInfo((prev) => (prev ? { ...prev, status } : prev));
      } catch {
        /* ignore */
      }
    });

    es.addEventListener("heartbeat", (e: MessageEvent) => {
      try {
        const { uptime } = JSON.parse(e.data) as { uptime: number };
        setInfo((prev) => (prev ? { ...prev, uptime } : prev));
      } catch {
        /* ignore */
      }
    });

    es.addEventListener("config_updated", (e: MessageEvent) => {
      try {
        const { provider, model } = JSON.parse(e.data) as {
          provider?: string;
          model?: string;
        };
        setInfo((prev) =>
          prev
            ? { ...prev, activeLlmProvider: provider, activeLlmModel: model }
            : prev
        );
      } catch {
        /* ignore */
      }
    });

    es.addEventListener("intent_received", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data) as {
          intentId: string;
          action: string;
          params: Record<string, unknown>;
        };
        setIntentMap((prev) => {
          const next = new Map(prev);
          if (next.size >= MAX_INTENTS) {
            const oldest = next.keys().next().value;
            if (oldest !== undefined) next.delete(oldest);
          }
          next.set(d.intentId, {
            ...d,
            status: "pending",
            receivedAt: new Date().toISOString(),
          });
          return next;
        });
      } catch {
        /* ignore */
      }
    });

    es.addEventListener("intent_result", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data) as Partial<IntentEntry> & {
          intentId: string;
        };
        setIntentMap((prev) => {
          const next = new Map(prev);
          const existing = next.get(d.intentId);
          if (existing)
            next.set(d.intentId, {
              ...existing,
              ...d,
              completedAt: new Date().toISOString(),
            });
          return next;
        });
      } catch {
        /* ignore */
      }
    });

    return () => {
      es.close();
      setSseConnected(false);
    };
  }, []);

  const intents = [...intentMap.values()].sort((a, b) =>
    b.receivedAt.localeCompare(a.receivedAt)
  );

  return { info, logs, intents, sseConnected };
}
