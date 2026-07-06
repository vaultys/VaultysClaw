"use client";
import { agentsClient, usersClient, unwrap } from "@/lib/api/ts-rest/client";
import { AgentInfo, type UserGrant } from "@/lib/contracts";
import { useState, useEffect, useCallback } from "react";

const CAPABILITIES = [
  { id: "file_access", label: "File Access" },
  { id: "internet_access", label: "Internet Access" },
  { id: "browser_control", label: "Browser Control" },
  { id: "api_call", label: "API Call" },
  { id: "mail_send", label: "Mail Send" },
  { id: "code_execution", label: "Code Execution" },
  { id: "system_command", label: "System Command" },
] as const;

type Grant = UserGrant;

interface UserGrantsPanelProps {
  userDid: string;
}

export default function UserGrantsPanel({ userDid }: UserGrantsPanelProps) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>("*");
  const [selectedCaps, setSelectedCaps] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    const agents = unwrap(await agentsClient.search()).items;
    setAgents(agents ?? []);
  }, []);

  const loadGrants = useCallback(async () => {
    const { grants } = unwrap(
      await usersClient.listGrants({ params: { did: userDid } })
    );
    setGrants(grants ?? []);
  }, [userDid]);

  useEffect(() => {
    loadAgents();
    loadGrants();
  }, [loadAgents, loadGrants]);

  const toggleCap = (cap: string) => {
    setSelectedCaps((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]
    );
  };

  const handleGrant = async () => {
    if (selectedCaps.length === 0) return;
    setSaving(true);
    try {
      await usersClient.createGrant({
        params: { did: userDid },
        body: {
          agentDid: selectedAgent === "*" ? null : selectedAgent,
          capabilities: selectedCaps,
        },
      });
      setSelectedCaps([]);
      await loadGrants();
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (grantId: string) => {
    setRevoking(grantId);
    try {
      await usersClient.revokeGrant({
        params: { did: userDid, id: grantId },
      });
      await loadGrants();
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className="mt-3 space-y-4">
      {/* Existing grants */}
      {grants.length > 0 ? (
        <div className="space-y-2">
          {grants.map((g) => (
            <div
              key={g.id}
              className="flex items-start justify-between bg-background-200 border border-neutral-300 rounded-lg p-3 gap-3"
            >
              <div className="min-w-0">
                <p className="text-xs text-foreground-500">
                  {g.agentDid ? (
                    <>
                      Agent:{" "}
                      <span className="text-foreground-700 font-mono">
                        {g.agentDid.slice(-12)}
                      </span>
                    </>
                  ) : (
                    <span className="text-warning-400">All agents</span>
                  )}
                </p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {g.capabilities.map((c) => (
                    <span
                      key={c}
                      className="px-1.5 py-0.5 bg-primary-100 text-primary-600 rounded text-xs"
                    >
                      {c}
                    </span>
                  ))}
                </div>
                {g.expiresAt && (
                  <p className="text-xs text-foreground-400 mt-1">
                    Expires {new Date(g.expiresAt).toLocaleDateString()}
                  </p>
                )}
              </div>
              <button
                onClick={() => handleRevoke(g.id)}
                disabled={revoking === g.id}
                className="shrink-0 text-xs text-danger-600 hover:text-danger-300 disabled:opacity-50 transition-colors"
              >
                {revoking === g.id ? "…" : "Revoke"}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-foreground-400 text-xs">No grants yet.</p>
      )}

      {/* New grant form */}
      <div className="border border-neutral-300 rounded-lg p-3 space-y-3">
        <p className="text-xs text-foreground-500 font-medium uppercase tracking-wider">
          New grant
        </p>

        <div>
          <label className="text-xs text-foreground-500 block mb-1">
            Target agent
          </label>
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="w-full bg-background-200 border border-neutral-300 text-foreground text-sm rounded-lg px-2 py-1.5"
          >
            <option value="*">All agents</option>
            {agents.map((a) => (
              <option key={a.did} value={a.did}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-foreground-500 block mb-1">
            Capabilities
          </label>
          <div className="flex flex-wrap gap-1.5">
            {CAPABILITIES.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => toggleCap(id)}
                className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                  selectedCaps.includes(id)
                    ? "bg-primary-600 border-primary-500 text-white"
                    : "bg-background-200 border-neutral-300 text-foreground-500 hover:border-foreground-500"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleGrant}
          disabled={saving || selectedCaps.length === 0}
          className="w-full bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-sm font-medium py-1.5 rounded-lg transition-colors"
        >
          {saving ? "Granting…" : "Grant capabilities"}
        </button>
      </div>
    </div>
  );
}
