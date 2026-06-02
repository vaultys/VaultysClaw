"use client";

import { useMemo, useState } from "react";
import type { GraphData, GraphNode } from "@vaultysclaw/shared";

interface Props {
  data: GraphData;
  height: number;
  onNodeClick?: (node: GraphNode) => void;
}

// ─── Capability badge colours ─────────────────────────────────────────────────
const CAP_COLOR: Record<string, { bg: string; text: string }> = {
  file_access: { bg: "#172554", text: "#93c5fd" },
  internet_access: { bg: "#052e16", text: "#86efac" },
  browser_control: { bg: "#1e1b4b", text: "#c4b5fd" },
  api_call: { bg: "#1c1917", text: "#d6d3d1" },
  mail_send: { bg: "#2d1515", text: "#fca5a5" },
  code_execution: { bg: "#1a1a00", text: "#fde047" },
  system_command: { bg: "#1a0828", text: "#e879f9" },
};

function capStyle(cap: string) {
  return CAP_COLOR[cap] ?? { bg: "#1e293b", text: "#94a3b8" };
}

function capLabel(cap: string) {
  return cap.replace(/_/g, " ");
}

// ─── Hierarchy helpers ────────────────────────────────────────────────────────

interface UserRow {
  node: GraphNode;
  depth: number;
}

function buildUserRows(data: GraphData): UserRow[] {
  const userNodes = data.nodes.filter((n) => n.type === "user");
  const userMap = new Map(userNodes.map((n) => [n.id, n]));

  const childMap = new Map<string, string[]>();
  const parentMap = new Map<string, string>();

  for (const e of data.edges) {
    if (e.type !== "reports_to") continue;
    const child = e.source,
      parent = e.target;
    if (!userMap.has(child) || !userMap.has(parent)) continue;
    parentMap.set(child, parent);
    if (!childMap.has(parent)) childMap.set(parent, []);
    childMap.get(parent)!.push(child);
  }

  const visited = new Set<string>();
  const rows: UserRow[] = [];

  function dfs(id: string, depth: number) {
    if (visited.has(id)) return;
    visited.add(id);
    const node = userMap.get(id);
    if (node) rows.push({ node, depth });
    for (const c of childMap.get(id) ?? []) dfs(c, depth + 1);
  }

  // Roots first
  for (const n of userNodes) if (!parentMap.has(n.id)) dfs(n.id, 0);
  // Orphans (unreachable because supervisor is outside current data)
  for (const n of userNodes) if (!visited.has(n.id)) dfs(n.id, 0);

  return rows;
}

// ─── Grant lookup ─────────────────────────────────────────────────────────────

interface CellData {
  caps: string[];
  isDelegation: boolean;
}

function buildGrantMap(data: GraphData): Map<string, Map<string, CellData[]>> {
  // Map: userId → agentId → list of grant entries
  const map = new Map<string, Map<string, CellData[]>>();
  for (const e of data.edges) {
    if (e.type !== "grant" && e.type !== "delegation") continue;
    const userId = e.source;
    const agentId = e.target;
    if (!map.has(userId)) map.set(userId, new Map());
    const inner = map.get(userId)!;
    if (!inner.has(agentId)) inner.set(agentId, []);
    inner.get(agentId)!.push({
      caps: (e.capabilities ?? []) as string[],
      isDelegation: e.type === "delegation",
    });
  }
  return map;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function MatrixView({ data, height, onNodeClick }: Props) {
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());

  const userRows = useMemo(() => buildUserRows(data), [data]);
  const agentAll = useMemo(
    () => data.nodes.filter((n) => n.type === "agent"),
    [data]
  );
  const grantMap = useMemo(() => buildGrantMap(data), [data]);

  // Only show users that have at least one grant/delegation edge
  const filteredUserRows = useMemo(
    () => userRows.filter(({ node }) => grantMap.has(node.id)),
    [userRows, grantMap]
  );

  // Only show agents that appear as a target in at least one grant/delegation edge
  const agentCols = useMemo(() => {
    const linked = new Set<string>();
    for (const inner of grantMap.values()) {
      for (const agentId of inner.keys()) linked.add(agentId);
    }
    return agentAll.filter((a) => linked.has(a.id));
  }, [agentAll, grantMap]);

  if (filteredUserRows.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-foreground-500"
        style={{ height }}
      >
        No users to display
      </div>
    );
  }

  function toggleCell(key: string) {
    setExpandedCells((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function userInitials(label: string) {
    return (
      label
        .split(/\s+/)
        .map((w) => w[0] ?? "")
        .join("")
        .toUpperCase()
        .slice(0, 2) || "?"
    );
  }

  return (
    <div className="overflow-auto" style={{ height, maxHeight: height }}>
      <table
        className="w-full border-collapse text-sm"
        style={{ minWidth: agentCols.length * 140 + 220 }}
      >
        <thead>
          <tr className="border-b border-neutral-200">
            {/* User column header */}
            <th className="sticky left-0 z-10 bg-background-100 text-left px-4 py-3 text-xs font-semibold text-foreground-500 uppercase tracking-wider whitespace-nowrap min-w-[200px]">
              User
            </th>
            {agentCols.map((agent) => (
              <th
                key={agent.id}
                className="px-3 py-3 text-center align-bottom cursor-pointer hover:bg-background-200 transition-colors"
                onClick={() => onNodeClick?.(agent)}
              >
                <div className="flex flex-col items-center gap-1.5">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: agent.isOnline ? "success" : "#475569",
                    }}
                    title={agent.isOnline ? "Online" : "Offline"}
                  />
                  <span
                    className="text-xs font-medium max-w-[120px] truncate block"
                    style={{ color: agent.isOnline ? "#6ee7b7" : "#94a3b8" }}
                    title={agent.label}
                  >
                    {agent.label}
                  </span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filteredUserRows.map(({ node: user, depth }) => {
            const label = user.label || user.id.replace("user:", "");
            const role = user.role ?? "member";
            const userGrants = grantMap.get(user.id);
            const ini = userInitials(label);

            return (
              <tr
                key={user.id}
                className="border-b border-neutral-200 hover:bg-background-200/50 transition-colors group"
              >
                {/* ── User cell ── */}
                <td
                  className="sticky left-0 z-10 bg-background-100 group-hover:bg-background-200/50 px-4 py-3 cursor-pointer"
                  onClick={() => onNodeClick?.(user)}
                >
                  <div
                    className="flex items-center gap-2.5"
                    style={{ paddingLeft: depth * 20 }}
                  >
                    {/* Hierarchy indent connector */}
                    {depth > 0 && (
                      <span className="text-neutral-200 text-xs select-none shrink-0">
                        └─
                      </span>
                    )}
                    {/* Avatar */}
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                      style={{
                        backgroundColor: `hsl(${Array.from(label).reduce((a, c) => a + c.charCodeAt(0), 0) % 360}, 45%, 32%)`,
                      }}
                    >
                      {ini}
                    </div>
                    {/* Name + role */}
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate max-w-[120px]">
                        {label}
                      </div>
                      <RolePill role={role} />
                    </div>
                  </div>
                </td>

                {/* ── Grant cells ── */}
                {agentCols.map((agent) => {
                  const cellKey = `${user.id}::${agent.id}`;
                  const grants = userGrants?.get(agent.id) ?? [];
                  const expanded = expandedCells.has(cellKey);

                  if (grants.length === 0) {
                    return (
                      <td key={agent.id} className="px-3 py-3 text-center">
                        <span className="text-neutral-200 text-xs">—</span>
                      </td>
                    );
                  }

                  const allCaps = [...new Set(grants.flatMap((g) => g.caps))];
                  const hasDelegation = grants.some((g) => g.isDelegation);
                  const hasGrant = grants.some((g) => !g.isDelegation);

                  return (
                    <td
                      key={agent.id}
                      className="px-3 py-3 text-center cursor-pointer"
                      onClick={() => toggleCell(cellKey)}
                    >
                      {expanded ? (
                        <div className="flex flex-wrap gap-1 justify-center">
                          {allCaps.map((cap) => {
                            const cs = capStyle(cap);
                            return (
                              <span
                                key={cap}
                                className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap"
                                style={{
                                  backgroundColor: cs.bg,
                                  color: cs.text,
                                }}
                              >
                                {capLabel(cap)}
                              </span>
                            );
                          })}
                          {hasDelegation && (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-danger-50 dark:bg-danger-950 text-danger-600 dark:text-danger-400">
                              delegated
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-0.5">
                          <div className="flex gap-1 justify-center">
                            {hasGrant && (
                              <span
                                className="inline-block w-2 h-2 rounded-full bg-warning-500"
                                title="Grant"
                              />
                            )}
                            {hasDelegation && (
                              <span
                                className="inline-block w-2 h-2 rounded-full bg-danger-500"
                                title="Delegation"
                              />
                            )}
                          </div>
                          <span className="text-[10px] text-foreground-500">
                            {allCaps.length} cap
                            {allCaps.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Footer legend */}
      <div className="flex items-center gap-6 px-4 py-3 border-t border-neutral-200 text-xs text-foreground-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-warning-500" />
          Grant
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-danger-500" />
          Delegation
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-success-500" />
          Agent online
        </span>
        <span className="text-neutral-200 ml-auto">
          Click a cell to expand capabilities
        </span>
      </div>
    </div>
  );
}

function RolePill({ role }: { role: string }) {
  const styles: Record<string, string> = {
    owner:
      "bg-warning-50 dark:bg-warning-950 text-warning-700 dark:text-warning-400",
    admin:
      "bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-400",
    manager:
      "bg-secondary-50 dark:bg-secondary-950 text-secondary-700 dark:text-secondary-400",
    operator:
      "bg-success-50 dark:bg-success-950 text-success-700 dark:text-success-400",
    member:
      "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400",
  };
  return (
    <span
      className={`inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded-full capitalize mt-0.5 ${styles[role] ?? styles.member}`}
    >
      {role}
    </span>
  );
}
