"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plug, Loader2, Wifi, WifiOff, Clock, ArrowRight } from "lucide-react";
import { IntegrationPanel, IntegrationHeader, StatusBadge } from "./shared";
import { adminApi, unwrap } from "@/lib/api/ts-rest/client";
import type { AgentInfo } from "@/lib/contracts";

export function McpPanel() {
  const router = useRouter();
  const [gateways, setGateways] = useState<AgentInfo[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      adminApi.agents.search({ query: { search: "mcp-gateway" } }),
      adminApi.registrations.list(),
    ])
      .then(([agentsRes, regsRes]) => {
        setGateways(unwrap(agentsRes).items);
        const regs = unwrap(regsRes).registrations as unknown as { status: string; agentName: string }[];
        setPendingCount(
          regs.filter((r) => r.status === "pending" && r.agentName.includes("mcp")).length
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <IntegrationPanel>
      <IntegrationHeader
        icon={Plug}
        title="MCP Gateway"
        description="Expose peer agents as tools to Claude Code / Desktop"
      />
      <div className="p-5 space-y-5">
        <p className="text-sm text-foreground-500">
          The MCP gateway runs on your machine and connects to this control
          plane like any other agent. Once approved, an MCP client (Claude
          Code, Claude Desktop, or any other) can call your peer agents as
          tools — no API key, authenticated via VaultysId.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-foreground-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            {pendingCount > 0 && (
              <div className="flex items-center gap-2 bg-warning-50 border border-warning-300 rounded-lg px-3 py-2 text-xs text-warning-700">
                <Clock size={12} className="shrink-0" />
                {pendingCount} gateway registration{pendingCount > 1 ? "s" : ""} awaiting approval.{" "}
                <button
                  onClick={() => router.push("/admin/agents")}
                  className="underline underline-offset-2"
                >
                  Review in Agents
                </button>
              </div>
            )}

            {gateways.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-foreground-400 uppercase tracking-wider font-medium">
                  Connected gateways
                </p>
                {gateways.map((g) => (
                  <div
                    key={g.did}
                    className="flex items-center justify-between bg-background-200 rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {g.online ? (
                        <Wifi size={14} className="text-success-600 shrink-0" />
                      ) : (
                        <WifiOff size={14} className="text-foreground-400 shrink-0" />
                      )}
                      <span className="text-sm text-foreground truncate">{g.name}</span>
                    </div>
                    {g.online ? (
                      <StatusBadge status="success" message="Online" />
                    ) : (
                      <span className="text-xs text-foreground-400">Offline</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-foreground-400">
                No MCP gateway has connected yet.
              </p>
            )}
          </>
        )}

        <button
          onClick={() => router.push("/admin/agents/create?kind=mcp")}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Connect an MCP client <ArrowRight size={14} />
        </button>
      </div>
    </IntegrationPanel>
  );
}
