"use client";

import { useState, useEffect, useCallback } from "react";
import { shortDid } from "@vaultysclaw/shared";

interface UseNameResolutionOptions {
  type?: "agent" | "user" | "both";
  enabled?: boolean;
}

interface UseNameResolutionResult {
  nameMap: Record<string, string>;
  loading: boolean;
  error: Error | null;
}

/**
 * Resolve DIDs to human-readable names via API
 * Falls back to shortened DID if resolution fails
 *
 * @param dids Array of DIDs to resolve
 * @param options Resolution options
 * @returns Object with nameMap, loading state, and error
 */
export function useNameResolution(
  dids: string[],
  options: UseNameResolutionOptions = {}
): UseNameResolutionResult {
  const { type = "both", enabled = true } = options;
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const resolve = useCallback(async () => {
    if (!enabled || dids.length === 0) {
      setNameMap({});
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const newMap: Record<string, string> = {};

      // Resolve agents
      if (type === "agent" || type === "both") {
        const agentDids = dids.filter((d) => d.includes("agent"));
        if (agentDids.length > 0) {
          try {
            const res = await fetch("/api/agents?pageSize=100");
            if (res.ok) {
              const data = await res.json();
              const agents = data.agents || data.items || [];
              agents.forEach((a: any) => {
                const did = a.did || a.id;
                if (did && agentDids.includes(did)) {
                  newMap[did] = a.name || shortDid(did);
                }
              });
            }
          } catch (err) {
            // Fall back to shortDid
          }
        }
      }

      // Resolve users
      if (type === "user" || type === "both") {
        const userDids = dids.filter((d) => !d.includes("agent"));
        if (userDids.length > 0) {
          try {
            const res = await fetch("/api/users?pageSize=100");
            if (res.ok) {
              const data = await res.json();
              const users = data.users || data.items || [];
              users.forEach((u: any) => {
                const did = u.did || u.id;
                if (did && userDids.includes(did)) {
                  newMap[did] = u.name || u.email || shortDid(did);
                }
              });
            }
          } catch (err) {
            // Fall back to shortDid
          }
        }
      }

      // Ensure all DIDs have a fallback
      dids.forEach((did) => {
        if (!newMap[did]) {
          newMap[did] = shortDid(did);
        }
      });

      setNameMap(newMap);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to resolve names"));
      // Still set fallback names
      const fallbackMap: Record<string, string> = {};
      dids.forEach((did) => {
        fallbackMap[did] = shortDid(did);
      });
      setNameMap(fallbackMap);
    } finally {
      setLoading(false);
    }
  }, [dids, type, enabled]);

  useEffect(() => {
    resolve();
  }, [resolve]);

  return { nameMap, loading, error };
}
