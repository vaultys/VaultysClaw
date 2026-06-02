"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Bot,
  Search,
  FileText,
  ArrowRight,
  Copy,
  Check,
  Wrench,
  Calendar,
  Clock,
} from "lucide-react";
import { useWorkflowStore } from "./store";
import type { WorkflowNode } from "@/lib/workflow-executor";

interface Agent {
  id: string;
  name: string;
  capabilities: string[];
  online: boolean;
}

interface User {
  id: string;
  name: string;
  email: string;
  joinedAt: string;
}

interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}

/** Shows predecessor nodes and clickable variable tokens for output wiring */
const PredecessorInputs: React.FC<{
  nodeId: string;
  nodes: any[];
  edges: WorkflowEdge[];
  onInsert: (variable: string) => void;
}> = ({ nodeId, nodes, edges, onInsert }) => {
  const [copiedVar, setCopiedVar] = useState<string | null>(null);

  // Direct predecessors
  const predecessorIds = edges
    .filter((e) => e.target === nodeId)
    .map((e) => e.source);

  if (predecessorIds.length === 0) return null;

  const predecessors = predecessorIds
    .map((id) => nodes.find((n) => n.id === id))
    .filter(Boolean);

  const handleCopy = (variable: string) => {
    navigator.clipboard.writeText(variable).catch(() => {});
    setCopiedVar(variable);
    setTimeout(() => setCopiedVar(null), 1500);
  };

  return (
    <div className="rounded-lg border border-primary-500/40 bg-primary-500/5 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-primary-700 uppercase tracking-wide">
        <ArrowRight size={12} />
        Inputs from connected nodes
      </div>
      <p className="text-xs text-foreground-500">
        Click a variable to insert it into Parameters. Use dot notation to
        access nested fields.
      </p>
      <div className="space-y-2">
        {predecessors.map((pred: any) => {
          const label = (pred.data?.label as string | undefined) ?? pred.id;
          const fullOutput = `\${${pred.id}}`;
          return (
            <div key={pred.id} className="space-y-1">
              <p className="text-xs font-medium text-foreground truncate">
                {label}
              </p>
              <div className="flex flex-wrap gap-1">
                {[
                  { var: `\${${pred.id}}`, desc: "full output" },
                  { var: `\${${pred.id}.status}`, desc: "status" },
                  { var: `\${${pred.id}.message}`, desc: "message" },
                  { var: `\${${pred.id}.output}`, desc: "output" },
                ].map(({ var: v, desc }) => (
                  <div key={v} className="flex items-center gap-0.5">
                    <button
                      onClick={() => onInsert(v)}
                      title={`Insert ${v} into Parameters`}
                      className="font-mono text-[10px] px-1.5 py-0.5 bg-primary-100 border border-primary-300 text-primary-700 rounded hover:bg-primary-700/60 transition"
                    >
                      {v}
                    </button>
                    <button
                      onClick={() => handleCopy(v)}
                      title="Copy to clipboard"
                      className="p-0.5 text-foreground-400 hover:text-foreground transition"
                    >
                      {copiedVar === v ? (
                        <Check size={10} className="text-success-700" />
                      ) : (
                        <Copy size={10} />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-foreground-400 mt-1">
        e.g.{" "}
        <code className="font-mono">
          &#123;&quot;input&quot;: &quot;$&#123;{predecessors[0]?.id}
          .output&#125;&quot;&#125;
        </code>
      </p>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Static skill catalog — matches packages/agent-controller/skills/*
// ---------------------------------------------------------------------------
const SKILL_CATALOG: Record<
  string,
  {
    label: string;
    tools: { name: string; label: string; approvalRequired?: boolean }[];
  }
> = {
  "social-media": {
    label: "Social Media",
    tools: [
      { name: "setup_x_session", label: "Setup X session" },
      { name: "post_to_x", label: "Post to X", approvalRequired: true },
      { name: "check_x_session", label: "Check X session" },
      { name: "clear_x_session", label: "Clear X session" },
    ],
  },
  "web-scraper": {
    label: "Web Scraper",
    tools: [{ name: "scrape_page", label: "Scrape page" }],
  },
  "json-api": {
    label: "JSON API",
    tools: [{ name: "api_call_json", label: "API call (JSON)" }],
  },
  calculator: {
    label: "Calculator",
    tools: [{ name: "calculate", label: "Calculate" }],
  },
};

// ---------------------------------------------------------------------------
// Schedule panel (workflow-level, no node selected)
// ---------------------------------------------------------------------------
const CRON_PRESETS = [
  { label: "Every day at 9 AM", value: "0 9 * * *" },
  { label: "Every day at noon", value: "0 12 * * *" },
  { label: "Weekdays at 9 AM", value: "0 9 * * 1-5" },
  { label: "Every Monday at 8 AM", value: "0 8 * * 1" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Custom…", value: "" },
] as const;

const SchedulePanel: React.FC<{ workflowId: string | null }> = ({
  workflowId,
}) => {
  const [cron, setCron] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [nextRun, setNextRun] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [customMode, setCustomMode] = useState(false);

  useEffect(() => {
    if (!workflowId || workflowId === "default") return;
    setLoading(true);
    fetch(`/api/workflows/${workflowId}/schedule`)
      .then((r) => r.json())
      .then((d: any) => {
        setCron(d.scheduleCron ?? "");
        setEnabled(Boolean(d.scheduleEnabled));
        setNextRun(d.scheduleNextRun ?? null);
        setLastRun(d.scheduleLastRun ?? null);
        // If current cron doesn't match any preset, switch to custom mode
        const isPreset = CRON_PRESETS.some(
          (p) => p.value === d.scheduleCron && p.value !== ""
        );
        setCustomMode(!!d.scheduleCron && !isPreset);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [workflowId]);

  const handleSave = async () => {
    if (!workflowId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/workflows/${workflowId}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cron: cron || null, enabled }),
      });
      const d = (await res.json()) as any;
      if (!res.ok) throw new Error(d.error || "Failed");
      setNextRun(d.scheduleNextRun ?? null);
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleDisable = async () => {
    if (!workflowId) return;
    setSaving(true);
    try {
      await fetch(`/api/workflows/${workflowId}/schedule`, {
        method: "DELETE",
      });
      setCron("");
      setEnabled(false);
      setNextRun(null);
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  };

  if (!workflowId || workflowId === "default") {
    return (
      <div className="text-xs text-foreground-400 italic">
        Save the workflow first to configure a schedule.
      </div>
    );
  }

  if (loading)
    return <div className="text-xs text-foreground-500">Loading schedule…</div>;

  const selectedPreset = customMode
    ? ""
    : (CRON_PRESETS.find((p) => p.value === cron)?.value ?? "");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-foreground-700">
          Auto-run
        </label>
        <button
          onClick={() => setEnabled(!enabled)}
          className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${enabled ? "bg-success-500" : "bg-neutral-200"}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5 ${enabled ? "translate-x-4.5" : "translate-x-0.5"}`}
          />
        </button>
      </div>

      {/* Preset dropdown */}
      <div>
        <label className="block text-xs font-medium text-foreground-700 mb-1">
          Frequency
        </label>
        <select
          value={selectedPreset}
          onChange={(e) => {
            if (e.target.value === "") {
              setCustomMode(true);
            } else {
              setCustomMode(false);
              setCron(e.target.value);
            }
          }}
          className="w-full px-2 py-1.5 bg-background-100 text-foreground border border-neutral-200 rounded text-xs focus:ring-1 focus:ring-success-500"
        >
          {CRON_PRESETS.map((p) => (
            <option key={p.label} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {/* Custom cron input */}
      {customMode && (
        <div>
          <label className="block text-xs font-medium text-foreground-700 mb-1">
            Cron expression
          </label>
          <input
            type="text"
            value={cron}
            onChange={(e) => setCron(e.target.value)}
            placeholder="0 9 * * *"
            className="w-full px-2 py-1.5 bg-background-100 text-foreground border border-neutral-200 rounded text-xs font-mono focus:ring-1 focus:ring-success-500"
          />
          <p className="text-[10px] text-foreground-400 mt-1">
            5 fields: minute hour day month weekday
          </p>
        </div>
      )}

      {/* Next / last run */}
      {nextRun && (
        <p className="text-[10px] text-foreground-500">
          Next run:{" "}
          <span className="font-medium text-foreground">
            {new Date(nextRun).toLocaleString()}
          </span>
        </p>
      )}
      {lastRun && (
        <p className="text-[10px] text-foreground-400">
          Last run: {new Date(lastRun).toLocaleString()}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 text-xs py-1.5 bg-success-600 text-white rounded hover:bg-success-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save schedule"}
        </button>
        {(cron || enabled) && (
          <button
            onClick={handleDisable}
            disabled={saving}
            className="text-xs px-2 py-1.5 border border-neutral-200 text-foreground-500 rounded hover:bg-background-200 disabled:opacity-50"
          >
            Disable
          </button>
        )}
      </div>

      {status === "saved" && (
        <p className="text-xs text-success-600">✓ Schedule saved</p>
      )}
      {status === "error" && (
        <p className="text-xs text-danger-500">✗ Failed to save schedule</p>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Skill node properties
// ---------------------------------------------------------------------------
const SkillNodeProperties: React.FC<{
  node: any;
  nodes: any[];
  edges: WorkflowEdge[];
  agents: Agent[];
  filteredAgents: Agent[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  loading: boolean;
  selectedNodeId: string | null;
  updateNodeData: (key: string, value: any) => void;
  setNodes: (nodes: any[]) => void;
  insertIntoParams: (variable: string) => void;
  paramsTextRef: React.RefObject<HTMLTextAreaElement | null>;
}> = ({
  node,
  nodes,
  edges,
  agents,
  filteredAgents,
  searchQuery,
  setSearchQuery,
  loading,
  selectedNodeId,
  updateNodeData,
  setNodes,
  insertIntoParams,
  paramsTextRef,
}) => {
  const skillName = (node.data.skillName as string | undefined) ?? "";
  const toolName = (node.data.toolName as string | undefined) ?? "";
  const catalog = SKILL_CATALOG[skillName];
  const selectedTool = catalog?.tools.find((t) => t.name === toolName);

  return (
    <div className="space-y-4">
      {/* Skill selector */}
      <div>
        <label className="block text-sm font-medium text-foreground-700 mb-1">
          Skill
        </label>
        <select
          value={skillName}
          onChange={(e) => {
            updateNodeData("skillName", e.target.value || undefined);
            updateNodeData("toolName", undefined); // reset tool when skill changes
          }}
          className="w-full px-3 py-2 bg-background-100 text-foreground border border-neutral-200 rounded-md text-sm focus:ring-2 focus:ring-success-500"
        >
          <option value="">— select skill —</option>
          {Object.entries(SKILL_CATALOG).map(([id, { label }]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Tool selector */}
      {catalog && (
        <div>
          <label className="block text-sm font-medium text-foreground-700 mb-1">
            Tool
          </label>
          <select
            value={toolName}
            onChange={(e) =>
              updateNodeData("toolName", e.target.value || undefined)
            }
            className="w-full px-3 py-2 bg-background-100 text-foreground border border-neutral-200 rounded-md text-sm focus:ring-2 focus:ring-success-500"
          >
            <option value="">— select tool —</option>
            {catalog.tools.map((t) => (
              <option key={t.name} value={t.name}>
                {t.label}
                {t.approvalRequired ? " ⚠️" : ""}
              </option>
            ))}
          </select>
          {selectedTool?.approvalRequired && (
            <p className="text-xs text-warning-600 mt-1">
              ⚠️ This tool requires human approval before executing.
            </p>
          )}
        </div>
      )}

      {/* Agent picker (optional override — auto-resolved if blank) */}
      <div>
        <label className="block text-sm font-medium text-foreground-700 mb-1">
          Agent{" "}
          <span className="text-foreground-400 font-normal">(optional)</span>
        </label>
        <p className="text-xs text-foreground-400 mb-2">
          Leave blank to auto-select a capable agent in the realm.
        </p>
        <div className="relative mb-2">
          <Search
            size={14}
            className="absolute left-3 top-2.5 text-foreground-400"
          />
          <input
            type="text"
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-background-100 text-foreground border border-neutral-200 rounded-md text-sm focus:ring-2 focus:ring-success-500"
          />
        </div>
        <select
          value={(node.data.agentId as string | undefined) ?? ""}
          onChange={(e) => {
            const selected = agents.find((a) => a.id === e.target.value);
            setNodes(
              nodes.map((n: any) =>
                n.id === selectedNodeId
                  ? {
                      ...n,
                      data: {
                        ...n.data,
                        agentId: e.target.value || undefined,
                        agentName: selected?.name,
                      },
                    }
                  : n
              )
            );
          }}
          className="w-full px-3 py-2 bg-background-100 text-foreground border border-neutral-200 rounded-md text-sm focus:ring-2 focus:ring-success-500"
        >
          <option value="">— auto —</option>
          {loading ? (
            <option disabled>Loading agents…</option>
          ) : filteredAgents.length === 0 ? (
            <option disabled>No agents found</option>
          ) : (
            filteredAgents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.online ? " 🟢" : " 🔴"}
              </option>
            ))
          )}
        </select>
      </div>

      {/* Predecessor wiring */}
      <PredecessorInputs
        nodeId={node.id}
        nodes={nodes}
        edges={edges}
        onInsert={insertIntoParams}
      />

      {/* Params (tool input) */}
      <div>
        <label className="block text-sm font-medium text-foreground-700 mb-1">
          Tool params
        </label>
        <p className="text-xs text-foreground-400 mb-2">
          JSON object passed directly as tool input. Use{" "}
          <code className="font-mono text-success-600">
            $&#123;nodeId&#125;
          </code>{" "}
          to reference predecessor outputs.
        </p>
        <textarea
          ref={paramsTextRef}
          value={JSON.stringify(node.data.params || {}, null, 2)}
          onChange={(e) => {
            try {
              updateNodeData("params", JSON.parse(e.target.value));
            } catch {
              /* ignore */
            }
          }}
          className="w-full px-3 py-2 bg-background-100 text-foreground border border-neutral-200 rounded-md text-xs font-mono focus:ring-2 focus:ring-success-500 h-24"
          placeholder={'{\n "text": "${prev-node}"\n}'}
        />
      </div>
    </div>
  );
};

export const PropertiesPanel: React.FC<{
  nodes: any[];
  setNodes: (nodes: any[]) => void;
  edges: WorkflowEdge[];
}> = ({ nodes, setNodes, edges }) => {
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const workflowRealmId = useWorkflowStore((s) => s.workflowRealmId);

  const [agents, setAgents] = useState<Agent[]>([]);
  const [filteredAgents, setFilteredAgents] = useState<Agent[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [userLoading, setUserLoading] = useState(false);

  // Fetch agents from the realm when component mounts or realm changes
  useEffect(() => {
    const fetchAgents = async () => {
      // Skip if no realm ID or if still using the default placeholder
      if (!workflowRealmId || workflowRealmId === "default") return;
      setLoading(true);
      try {
        const res = await fetch(`/api/agents/search?realm=${workflowRealmId}`);
        if (!res.ok) throw new Error("Failed to fetch agents");
        const data = (await res.json()) as { agents: Agent[] };
        setAgents(data.agents);
        setFilteredAgents(data.agents);
        setSearchQuery("");
      } catch (err) {
        console.error("Failed to fetch agents:", err);
        setAgents([]);
        setFilteredAgents([]);
      } finally {
        setLoading(false);
      }
    };
    fetchAgents();
  }, [workflowRealmId]);

  // Filter agents based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredAgents(agents);
      return;
    }
    const query = searchQuery.toLowerCase();
    const filtered = agents.filter((agent) => {
      const nameMatch = agent.name.toLowerCase().includes(query);
      const capMatch = agent.capabilities.some((cap) =>
        cap.toLowerCase().includes(query)
      );
      return nameMatch || capMatch;
    });
    setFilteredAgents(filtered);
  }, [searchQuery, agents]);

  // Fetch users from the realm when component mounts or realm changes
  useEffect(() => {
    const fetchUsers = async () => {
      if (!workflowRealmId || workflowRealmId === "default") return;
      setUserLoading(true);
      try {
        const res = await fetch(`/api/users/search?realm=${workflowRealmId}`);
        if (!res.ok) throw new Error("Failed to fetch users");
        const data = (await res.json()) as { users: User[] };
        setUsers(data.users);
        setFilteredUsers(data.users);
        setUserSearchQuery("");
      } catch (err) {
        console.error("Failed to fetch users:", err);
        setUsers([]);
        setFilteredUsers([]);
      } finally {
        setUserLoading(false);
      }
    };
    fetchUsers();
  }, [workflowRealmId]);

  // Filter users based on search query
  useEffect(() => {
    if (!userSearchQuery.trim()) {
      setFilteredUsers(users);
      return;
    }
    const query = userSearchQuery.toLowerCase();
    const filtered = users.filter((user) => {
      const nameMatch = user.name.toLowerCase().includes(query);
      const emailMatch = user.email.toLowerCase().includes(query);
      return nameMatch || emailMatch;
    });
    setFilteredUsers(filtered);
  }, [userSearchQuery, users]);

  const workflowId = useWorkflowStore((s) => s.workflowId);
  const workflowName = useWorkflowStore((s) => s.workflowName);
  const workflowDescription = useWorkflowStore((s) => s.workflowDescription);
  const workflowInput = useWorkflowStore((s) => s.workflowInput);
  const setWorkflowInput = useWorkflowStore((s) => s.setWorkflowInput);

  const paramsTextRef = useRef<HTMLTextAreaElement | null>(null);

  if (!selectedNodeId) {
    return (
      <div className="w-64 bg-background-100 border-l border-neutral-200 flex flex-col h-full overflow-hidden">
        <div className="border-b border-neutral-200 p-4 flex items-center gap-2">
          <FileText size={15} className="text-foreground-400" />
          <h3 className="font-semibold text-foreground text-sm">Workflow</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <p className="text-xs font-medium text-foreground-700 mb-1">Name</p>
            <p className="text-sm text-foreground truncate">
              {workflowName || (
                <span className="italic text-foreground-400">Untitled</span>
              )}
            </p>
          </div>
          {workflowDescription && (
            <div>
              <p className="text-xs font-medium text-foreground-700 mb-1">
                Description
              </p>
              <p className="text-sm text-foreground-500">
                {workflowDescription}
              </p>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-foreground-700 mb-1">
              Default Input
            </label>
            <textarea
              rows={4}
              value={workflowInput}
              onChange={(e) => setWorkflowInput(e.target.value)}
              placeholder="Default input passed to the first agent (optional)…"
              className="w-full bg-background-200 text-foreground border border-neutral-200 rounded-md px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
            <p className="text-xs text-foreground-400 mt-1">
              Overridden at execution time if left empty.
            </p>
          </div>
          <div className="pt-2 border-t border-neutral-200 space-y-3">
            <div className="flex items-center gap-2">
              <Calendar size={13} className="text-foreground-400" />
              <p className="text-xs font-semibold text-foreground-700 uppercase tracking-wide">
                Schedule
              </p>
            </div>
            <SchedulePanel workflowId={workflowId} />
          </div>
          <div className="pt-2 border-t border-neutral-200">
            <p className="text-xs text-foreground-400">
              Click a node on the canvas to configure it.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const node = nodes.find((n) => n.id === selectedNodeId) as any;
  if (!node) {
    return (
      <div className="w-64 bg-background-200 border-l border-neutral-200 p-4 text-center text-foreground-500 text-sm">
        Node not found
      </div>
    );
  }

  const handleClose = () => {
    setSelectedNode(null);
  };

  /** Insert a variable token at the cursor position in the params textarea */
  const insertIntoParams = (variable: string) => {
    const ta = paramsTextRef.current;
    const currentRaw = JSON.stringify(node?.data?.params || {}, null, 2);
    if (!ta) {
      // Fallback: append as a new key
      try {
        const parsed = JSON.parse(currentRaw);
        parsed["input"] = variable;
        updateNodeData("params", parsed);
      } catch {
        /* ignore */
      }
      return;
    }
    const start = ta.selectionStart ?? currentRaw.length;
    const end = ta.selectionEnd ?? currentRaw.length;
    const next = currentRaw.slice(0, start) + variable + currentRaw.slice(end);
    try {
      updateNodeData("params", JSON.parse(next));
    } catch {
      // If inserting broke JSON, just put cursor back at end — user can fix manually
    }
    // Restore focus
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + variable.length, start + variable.length);
    }, 0);
  };

  const updateNodeData = (key: string, value: any) => {
    setNodes(
      nodes.map((n) =>
        n.id === selectedNodeId
          ? { ...n, data: { ...n.data, [key]: value } }
          : n
      )
    );
  };

  const renderNodeProperties = () => {
    switch (node.type) {
      case "agent":
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground-700 mb-2">
                Agent
              </label>

              {/* Search Box */}
              <div className="relative mb-2">
                <Search
                  size={14}
                  className="absolute left-3 top-2.5 text-foreground-400"
                />
                <input
                  type="text"
                  placeholder="Search agents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-background-100 text-foreground border border-neutral-200 rounded-md text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              {/* Agent Select */}
              <select
                value={node.data.agentId || ""}
                onChange={(e) => {
                  const selectedAgent = agents.find(
                    (a) => a.id === e.target.value
                  );
                  setNodes(
                    nodes.map((n) =>
                      n.id === selectedNodeId
                        ? {
                            ...n,
                            data: {
                              ...n.data,
                              agentId: e.target.value || undefined,
                              agentName: selectedAgent?.name || undefined,
                            },
                          }
                        : n
                    )
                  );
                }}
                className="w-full px-3 py-2 bg-background-100 text-foreground border border-neutral-200 rounded-md text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent max-h-48"
              >
                <option value="">-- Select agent --</option>
                {loading ? (
                  <option disabled>Loading agents...</option>
                ) : filteredAgents.length === 0 ? (
                  <option disabled>No agents found</option>
                ) : (
                  filteredAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                      {agent.online ? " 🟢" : " 🔴"}
                    </option>
                  ))
                )}
              </select>

              {filteredAgents.length > 0 && (
                <p className="text-xs text-foreground-400 mt-1">
                  {filteredAgents.length} agent
                  {filteredAgents.length !== 1 ? "s" : ""} found
                </p>
              )}
            </div>

            <div>
              <PredecessorInputs
                nodeId={node.id}
                nodes={nodes}
                edges={edges}
                onInsert={insertIntoParams}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-foreground-700">
                  Parameters
                </label>
                {/* Re-wire button: reset input to predecessor output */}
                {edges.filter((e) => e.target === node.id).length > 0 &&
                  (() => {
                    const srcId = edges.find(
                      (e) => e.target === node.id
                    )?.source;
                    const expected = srcId ? `\${${srcId}}` : null;
                    const current = (node.data.params as any)?.input;
                    if (!expected || current === expected) return null;
                    return (
                      <button
                        onClick={() =>
                          updateNodeData("params", {
                            ...((node.data.params as object) ?? {}),
                            input: expected,
                          })
                        }
                        className="text-[10px] text-primary-700 hover:text-primary-300 border border-primary-300 px-1.5 py-0.5 rounded"
                      >
                        ↺ Reset auto-wire
                      </button>
                    );
                  })()}
              </div>

              {/* How params work — always visible */}
              <div className="mb-2 rounded border border-neutral-200 bg-background-200/60 p-2 space-y-1 text-xs text-foreground-500">
                <p className="font-semibold text-foreground">How params work</p>
                <p>
                  The <strong>full params object</strong> is sent to the agent —
                  every key/value pair, not just{" "}
                  <code className="font-mono">input</code>.
                </p>
                <p>
                  Use{" "}
                  <code className="font-mono text-primary-700">
                    ${"{"}nodeId{"}"}
                  </code>{" "}
                  to pass an entire predecessor output, or{" "}
                  <code className="font-mono text-primary-700">
                    ${"{"}nodeId.field{"}"}
                  </code>{" "}
                  for a specific field.
                </p>
                <p className="text-foreground-400">
                  e.g.{" "}
                  <code className="font-mono">
                    {"{"}"input": "${"{"}step-1{"}"}"{"}"}
                  </code>{" "}
                  sends step-1's full output as{" "}
                  <code className="font-mono">input</code>.
                </p>
              </div>

              <textarea
                ref={paramsTextRef}
                value={JSON.stringify(node.data.params || {}, null, 2)}
                onChange={(e) => {
                  try {
                    updateNodeData("params", JSON.parse(e.target.value));
                  } catch {
                    // Invalid JSON, ignore
                  }
                }}
                className="w-full px-3 py-2 bg-background-100 text-foreground border border-neutral-200 rounded-md text-xs font-mono focus:ring-2 focus:ring-primary-500 focus:border-transparent h-24"
                placeholder="{&#10; &#34;input&#34;: &#34;${prevNodeId}&#34;&#10;}"
              />
            </div>
          </div>
        );

      case "condition":
        return (
          <div className="space-y-4">
            <PredecessorInputs
              nodeId={node.id}
              nodes={nodes}
              edges={edges}
              onInsert={(v) =>
                updateNodeData("expression", (node.data.expression || "") + v)
              }
            />
            <div>
              <label className="block text-sm font-medium text-foreground-700 mb-1">
                Expression
              </label>
              <div className="mb-2 rounded border border-neutral-200 bg-background-200/60 p-2 text-xs text-foreground-500">
                Evaluated as JavaScript. Reference predecessor outputs with{" "}
                <code className="font-mono text-primary-700">
                  ${"{"}nodeId.field{"}"}
                </code>
                . Must return <code className="font-mono">true</code> or{" "}
                <code className="font-mono">false</code>.
              </div>
              <textarea
                value={node.data.expression || ""}
                onChange={(e) => updateNodeData("expression", e.target.value)}
                className="w-full px-3 py-2 bg-background-100 text-foreground border border-neutral-200 rounded-md text-xs font-mono focus:ring-2 focus:ring-warning-500 focus:border-transparent h-20"
                placeholder="e.g., output.status === 'success' && output.confidence > 0.8"
              />
              <p className="text-xs text-foreground-400 mt-1">
                Returns true/false to route execution.
              </p>
            </div>
          </div>
        );

      case "delay":
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground-700 mb-1">
                Duration (seconds)
              </label>
              <input
                type="number"
                value={node.data.duration || 1}
                onChange={(e) =>
                  updateNodeData("duration", parseInt(e.target.value) || 1)
                }
                className="w-full px-3 py-2 bg-background-100 text-foreground border border-neutral-200 rounded-md text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                min="1"
                step="1"
              />
            </div>
          </div>
        );

      case "parallel":
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground-700 mb-1">
                Agents (one per line)
              </label>
              <textarea
                value={
                  (node.data.agents as string[] | undefined)?.join("\n") || ""
                }
                onChange={(e) =>
                  updateNodeData(
                    "agents",
                    e.target.value.split("\n").filter((a) => a.trim())
                  )
                }
                className="w-full px-3 py-2 bg-background-100 text-foreground border border-neutral-200 rounded-md text-xs font-mono focus:ring-2 focus:ring-secondary-500 focus:border-transparent h-24"
                placeholder="agent-1&#10;agent-2&#10;agent-3"
              />
            </div>
          </div>
        );

      case "label":
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground-700 mb-1">
                Label Text
              </label>
              <textarea
                value={node.data.text || ""}
                onChange={(e) => updateNodeData("text", e.target.value)}
                className="w-full px-3 py-2 bg-background-100 text-foreground border border-neutral-200 rounded-md text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent h-24"
                placeholder="Enter label text..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground-700 mb-2">
                Color
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  "yellow",
                  "pink",
                  "blue",
                  "green",
                  "purple",
                  "red",
                  "amber",
                  "cyan",
                ].map((color) => (
                  <button
                    key={color}
                    onClick={() => updateNodeData("color", color)}
                    className={`w-8 h-8 rounded border-2 capitalize text-xs font-bold transition-all ${
                      node.data.color === color
                        ? "border-primary-500 ring-2 ring-offset-1 ring-primary-500"
                        : "border-neutral-200"
                    } ${
                      {
                        yellow: "bg-warning-300",
                        pink: "bg-danger-300",
                        blue: "bg-primary-300",
                        green: "bg-success-300",
                        purple: "bg-secondary-300",
                        red: "bg-danger-300",
                        amber: "bg-warning-300",
                        cyan: "bg-primary-300",
                      }[color]
                    }`}
                    title={color}
                  />
                ))}
              </div>
            </div>
          </div>
        );

      case "user":
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground-700 mb-1">
                Mode
              </label>
              <select
                value={node.data.mode || "approval"}
                onChange={(e) => updateNodeData("mode", e.target.value)}
                className="w-full px-3 py-2 bg-background-100 text-foreground border border-neutral-200 rounded-md text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="approval">Approval (blocks workflow)</option>
                <option value="notification">Notification (continues)</option>
              </select>
              <p className="text-xs text-foreground-400 mt-1">
                Approval mode waits for user confirmation. Notification mode
                sends a message and continues.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground-700 mb-1">
                Message
              </label>
              <textarea
                value={node.data.message || ""}
                onChange={(e) => updateNodeData("message", e.target.value)}
                className="w-full px-3 py-2 bg-background-100 text-foreground border border-neutral-200 rounded-md text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent h-20"
                placeholder="Enter a message for the user..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground-700 mb-1">
                Assigned user
              </label>

              {/* Search Box */}
              <div className="relative mb-2">
                <Search
                  size={14}
                  className="absolute left-3 top-2.5 text-foreground-400"
                />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-background-100 text-foreground border border-neutral-200 rounded-md text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              {/* Single user select */}
              <select
                value={(node.data.assignedUserId as string) || ""}
                onChange={(e) => {
                  const selectedUser = users.find(
                    (u) => u.id === e.target.value
                  );
                  setNodes(
                    nodes.map((n) =>
                      n.id === selectedNodeId
                        ? {
                            ...n,
                            data: {
                              ...n.data,
                              assignedUserId: e.target.value || undefined,
                              assignedUserName: selectedUser?.name || undefined,
                            },
                          }
                        : n
                    )
                  );
                }}
                className="w-full px-3 py-2 bg-background-100 text-foreground border border-neutral-200 rounded-md text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="">-- Select user --</option>
                {userLoading ? (
                  <option disabled>Loading users...</option>
                ) : filteredUsers.length === 0 ? (
                  <option disabled>No users found</option>
                ) : (
                  filteredUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.email})
                    </option>
                  ))
                )}
              </select>

              {node.data.assignedUserId &&
                (() => {
                  const user = users.find(
                    (u) => u.id === node.data.assignedUserId
                  );
                  return user ? (
                    <p className="text-xs text-foreground-400 mt-1">
                      {user.name} — {user.email}
                    </p>
                  ) : null;
                })()}
              <p className="text-xs text-foreground-400 mt-1">
                The user who will receive this step for{" "}
                {node.data.mode === "approval" ? "approval" : "notification"}.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground-700 mb-1">
                Timeout (minutes, optional)
              </label>
              <input
                type="number"
                value={node.data.timeout || ""}
                onChange={(e) =>
                  updateNodeData(
                    "timeout",
                    e.target.value ? parseInt(e.target.value) : undefined
                  )
                }
                className="w-full px-3 py-2 bg-background-100 text-foreground border border-neutral-200 rounded-md text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Leave empty for no timeout"
                min="1"
                step="1"
              />
              <p className="text-xs text-foreground-400 mt-1">
                If set, workflow auto-continues after timeout (approval mode
                only).
              </p>
            </div>
          </div>
        );

      case "skill":
        return (
          <SkillNodeProperties
            node={node}
            nodes={nodes}
            edges={edges}
            agents={agents}
            filteredAgents={filteredAgents}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            loading={loading}
            selectedNodeId={selectedNodeId}
            updateNodeData={updateNodeData}
            setNodes={setNodes}
            insertIntoParams={insertIntoParams}
            paramsTextRef={paramsTextRef}
          />
        );

      default:
        return (
          <div className="text-sm text-foreground-500">
            No properties available for {node.type} nodes
          </div>
        );
    }
  };

  return (
    <div className="w-64 bg-background-100 border-l border-neutral-200 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-neutral-200 p-4 flex justify-between items-center">
        <h3 className="font-semibold text-foreground text-sm">Properties</h3>
        <button
          onClick={handleClose}
          className="p-1 hover:bg-background-200 rounded"
        >
          <X size={16} className="text-foreground-500" />
        </button>
      </div>

      {/* Node Type */}
      <div className="px-4 py-3 border-b border-neutral-200 bg-background-200">
        <p className="text-xs text-foreground-500">Node type</p>
        <p className="font-medium text-sm text-foreground capitalize">
          {node.type}
        </p>
      </div>

      {/* Properties */}
      <div className="flex-1 overflow-y-auto p-4">{renderNodeProperties()}</div>
    </div>
  );
};
