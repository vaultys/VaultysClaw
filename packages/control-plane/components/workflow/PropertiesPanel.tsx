"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, Bot, Search, FileText, ArrowRight, Copy, Check } from "lucide-react";
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
    navigator.clipboard.writeText(variable).catch(() => { });
    setCopiedVar(variable);
    setTimeout(() => setCopiedVar(null), 1500);
  };

  return (
    <div className="rounded-lg border border-indigo-500/40 bg-indigo-500/5 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-400 uppercase tracking-wide">
        <ArrowRight size={12} />
        Inputs from connected nodes
      </div>
      <p className="text-xs text-vc-muted">
        Click a variable to insert it into Parameters. Use dot notation to access nested fields.
      </p>
      <div className="space-y-2">
        {predecessors.map((pred: any) => {
          const label = (pred.data?.label as string | undefined) ?? pred.id;
          const fullOutput = `\${${pred.id}}`;
          return (
            <div key={pred.id} className="space-y-1">
              <p className="text-xs font-medium text-vc-text truncate">{label}</p>
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
                      className="font-mono text-[10px] px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/50 border border-indigo-300 dark:border-indigo-700/60 text-indigo-700 dark:text-indigo-300 rounded hover:bg-indigo-700/60 transition"
                    >
                      {v}
                    </button>
                    <button
                      onClick={() => handleCopy(v)}
                      title="Copy to clipboard"
                      className="p-0.5 text-vc-subtle hover:text-vc-text transition"
                    >
                      {copiedVar === v ? <Check size={10} className="text-green-700 dark:text-green-400" /> : <Copy size={10} />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-vc-subtle mt-1">
        e.g. <code className="font-mono">&#123;&quot;input&quot;: &quot;$&#123;{predecessors[0]?.id}.output&#125;&quot;&#125;</code>
      </p>
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

  const workflowName = useWorkflowStore((s) => s.workflowName);
  const workflowDescription = useWorkflowStore((s) => s.workflowDescription);
  const workflowInput = useWorkflowStore((s) => s.workflowInput);
  const setWorkflowInput = useWorkflowStore((s) => s.setWorkflowInput);

  const paramsTextRef = useRef<HTMLTextAreaElement | null>(null);

  if (!selectedNodeId) {
    return (
      <div className="w-64 bg-vc-surface border-l border-vc-border flex flex-col h-full overflow-hidden">
        <div className="border-b border-vc-border p-4 flex items-center gap-2">
          <FileText size={15} className="text-vc-subtle" />
          <h3 className="font-semibold text-vc-text text-sm">Workflow</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <p className="text-xs font-medium text-vc-text-2 mb-1">Name</p>
            <p className="text-sm text-vc-text truncate">{workflowName || <span className="italic text-vc-subtle">Untitled</span>}</p>
          </div>
          {workflowDescription && (
            <div>
              <p className="text-xs font-medium text-vc-text-2 mb-1">Description</p>
              <p className="text-sm text-vc-muted">{workflowDescription}</p>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-vc-text-2 mb-1">Default Input</label>
            <textarea
              rows={4}
              value={workflowInput}
              onChange={(e) => setWorkflowInput(e.target.value)}
              placeholder="Default input passed to the first agent (optional)…"
              className="w-full bg-vc-raised text-vc-text border border-vc-border rounded-md px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
            <p className="text-xs text-vc-subtle mt-1">Overridden at execution time if left empty.</p>
          </div>
          <div className="pt-2 border-t border-vc-border">
            <p className="text-xs text-vc-subtle">Click a node on the canvas to configure it.</p>
          </div>
        </div>
      </div>
    );
  }

  const node = nodes.find((n) => n.id === selectedNodeId) as any;
  if (!node) {
    return (
      <div className="w-64 bg-vc-raised border-l border-vc-border p-4 text-center text-vc-muted text-sm">
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
      } catch { /* ignore */ }
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
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + variable.length, start + variable.length); }, 0);
  };

  const updateNodeData = (key: string, value: any) => {
    setNodes(
      nodes.map((n) =>
        n.id === selectedNodeId ? { ...n, data: { ...n.data, [key]: value } } : n,
      ),
    );
  };

  const renderNodeProperties = () => {
    switch (node.type) {
      case "agent":
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-vc-text-2 mb-2">Agent</label>

              {/* Search Box */}
              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-2.5 text-vc-subtle" />
                <input
                  type="text"
                  placeholder="Search agents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-vc-surface text-vc-text border border-vc-border rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              {/* Agent Select */}
              <select
                value={node.data.agentId || ""}
                onChange={(e) => {
                  const selectedAgent = agents.find((a) => a.id === e.target.value);
                  setNodes(
                    nodes.map((n) =>
                      n.id === selectedNodeId
                        ? { ...n, data: { ...n.data, agentId: e.target.value || undefined, agentName: selectedAgent?.name || undefined } }
                        : n,
                    ),
                  );
                }}
                className="w-full px-3 py-2 bg-vc-surface text-vc-text border border-vc-border rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent max-h-48"
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
                <p className="text-xs text-vc-subtle mt-1">
                  {filteredAgents.length} agent{filteredAgents.length !== 1 ? "s" : ""} found
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
                <label className="block text-sm font-medium text-vc-text-2">Parameters</label>
                {/* Re-wire button: reset input to predecessor output */}
                {edges.filter((e) => e.target === node.id).length > 0 && (() => {
                  const srcId = edges.find((e) => e.target === node.id)?.source;
                  const expected = srcId ? `\${${srcId}}` : null;
                  const current = (node.data.params as any)?.input;
                  if (!expected || current === expected) return null;
                  return (
                    <button
                      onClick={() => updateNodeData("params", { ...(node.data.params as object ?? {}), input: expected })}
                      className="text-[10px] text-indigo-700 dark:text-indigo-400 hover:text-indigo-300 border border-indigo-300 dark:border-indigo-700/50 px-1.5 py-0.5 rounded"
                    >
                      ↺ Reset auto-wire
                    </button>
                  );
                })()}
              </div>

              {/* How params work — always visible */}
              <div className="mb-2 rounded border border-vc-border bg-vc-raised/60 p-2 space-y-1 text-xs text-vc-muted">
                <p className="font-semibold text-vc-text">How params work</p>
                <p>The <strong>full params object</strong> is sent to the agent — every key/value pair, not just <code className="font-mono">input</code>.</p>
                <p>Use <code className="font-mono text-indigo-700 dark:text-indigo-300">${'{'}nodeId{'}'}</code> to pass an entire predecessor output, or <code className="font-mono text-indigo-700 dark:text-indigo-300">${'{'}nodeId.field{'}'}</code> for a specific field.</p>
                <p className="text-vc-subtle">e.g. <code className="font-mono">{'{'}"input": "${'{'}step-1{'}'}"{'}'}</code> sends step-1's full output as <code className="font-mono">input</code>.</p>
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
                className="w-full px-3 py-2 bg-vc-surface text-vc-text border border-vc-border rounded-md text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent h-24"
                placeholder="{&#10;  &#34;input&#34;: &#34;${prevNodeId}&#34;&#10;}"
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
              onInsert={(v) => updateNodeData("expression", (node.data.expression || "") + v)}
            />
            <div>
              <label className="block text-sm font-medium text-vc-text-2 mb-1">Expression</label>
              <div className="mb-2 rounded border border-vc-border bg-vc-raised/60 p-2 text-xs text-vc-muted">
                Evaluated as JavaScript. Reference predecessor outputs with <code className="font-mono text-indigo-700 dark:text-indigo-300">${'{'}nodeId.field{'}'}</code>. Must return <code className="font-mono">true</code> or <code className="font-mono">false</code>.
              </div>
              <textarea
                value={node.data.expression || ""}
                onChange={(e) => updateNodeData("expression", e.target.value)}
                className="w-full px-3 py-2 bg-vc-surface text-vc-text border border-vc-border rounded-md text-xs font-mono focus:ring-2 focus:ring-orange-500 focus:border-transparent h-20"
                placeholder="e.g., output.status === 'success' && output.confidence > 0.8"
              />
              <p className="text-xs text-vc-subtle mt-1">Returns true/false to route execution.</p>
            </div>
          </div>
        );

      case "delay":
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-vc-text-2 mb-1">Duration (seconds)</label>
              <input
                type="number"
                value={node.data.duration || 1}
                onChange={(e) => updateNodeData("duration", parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 bg-vc-surface text-vc-text border border-vc-border rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
              <label className="block text-sm font-medium text-vc-text-2 mb-1">Agents (one per line)</label>
              <textarea
                value={(node.data.agents as string[] | undefined)?.join("\n") || ""}
                onChange={(e) => updateNodeData("agents", e.target.value.split("\n").filter((a) => a.trim()))}
                className="w-full px-3 py-2 bg-vc-surface text-vc-text border border-vc-border rounded-md text-xs font-mono focus:ring-2 focus:ring-purple-500 focus:border-transparent h-24"
                placeholder="agent-1&#10;agent-2&#10;agent-3"
              />
            </div>
          </div>
        );

      case "label":
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-vc-text-2 mb-1">Label Text</label>
              <textarea
                value={node.data.text || ""}
                onChange={(e) => updateNodeData("text", e.target.value)}
                className="w-full px-3 py-2 bg-vc-surface text-vc-text border border-vc-border rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent h-24"
                placeholder="Enter label text..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-vc-text-2 mb-2">Color</label>
              <div className="grid grid-cols-4 gap-2">
                {["yellow", "pink", "blue", "green", "purple", "red", "amber", "cyan"].map((color) => (
                  <button
                    key={color}
                    onClick={() => updateNodeData("color", color)}
                    className={`w-8 h-8 rounded border-2 capitalize text-xs font-bold transition-all ${node.data.color === color ? "border-indigo-500 ring-2 ring-offset-1 ring-indigo-500 dark:ring-offset-gray-900" : "border-vc-border"
                      } ${{
                        yellow: "bg-yellow-300",
                        pink: "bg-pink-300",
                        blue: "bg-blue-300",
                        green: "bg-green-300",
                        purple: "bg-purple-300",
                        red: "bg-red-300",
                        amber: "bg-amber-300",
                        cyan: "bg-cyan-300",
                      }[color]}`}
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
              <label className="block text-sm font-medium text-vc-text-2 mb-1">Mode</label>
              <select
                value={node.data.mode || "approval"}
                onChange={(e) => updateNodeData("mode", e.target.value)}
                className="w-full px-3 py-2 bg-vc-surface text-vc-text border border-vc-border rounded-md text-sm focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              >
                <option value="approval">Approval (blocks workflow)</option>
                <option value="notification">Notification (continues)</option>
              </select>
              <p className="text-xs text-vc-subtle mt-1">
                Approval mode waits for user confirmation. Notification mode sends a message and continues.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-vc-text-2 mb-1">Message</label>
              <textarea
                value={node.data.message || ""}
                onChange={(e) => updateNodeData("message", e.target.value)}
                className="w-full px-3 py-2 bg-vc-surface text-vc-text border border-vc-border rounded-md text-sm focus:ring-2 focus:ring-cyan-500 focus:border-transparent h-20"
                placeholder="Enter a message for the user..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-vc-text-2 mb-1">Assigned user</label>

              {/* Search Box */}
              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-2.5 text-vc-subtle" />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-vc-surface text-vc-text border border-vc-border rounded-md text-sm focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                />
              </div>

              {/* Single user select */}
              <select
                value={(node.data.assignedUserId as string) || ""}
                onChange={(e) => {
                  const selectedUser = users.find((u) => u.id === e.target.value);
                  setNodes(
                    nodes.map((n) =>
                      n.id === selectedNodeId
                        ? { ...n, data: { ...n.data, assignedUserId: e.target.value || undefined, assignedUserName: selectedUser?.name || undefined } }
                        : n,
                    ),
                  );
                }}
                className="w-full px-3 py-2 bg-vc-surface text-vc-text border border-vc-border rounded-md text-sm focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
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

              {node.data.assignedUserId && (() => {
                const user = users.find((u) => u.id === node.data.assignedUserId);
                return user ? (
                  <p className="text-xs text-vc-subtle mt-1">
                    {user.name} — {user.email}
                  </p>
                ) : null;
              })()}
              <p className="text-xs text-vc-subtle mt-1">The user who will receive this step for {node.data.mode === "approval" ? "approval" : "notification"}.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-vc-text-2 mb-1">Timeout (minutes, optional)</label>
              <input
                type="number"
                value={node.data.timeout || ""}
                onChange={(e) => updateNodeData("timeout", e.target.value ? parseInt(e.target.value) : undefined)}
                className="w-full px-3 py-2 bg-vc-surface text-vc-text border border-vc-border rounded-md text-sm focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="Leave empty for no timeout"
                min="1"
                step="1"
              />
              <p className="text-xs text-vc-subtle mt-1">If set, workflow auto-continues after timeout (approval mode only).</p>
            </div>
          </div>
        );

      default:
        return (
          <div className="text-sm text-vc-muted">
            No properties available for {node.type} nodes
          </div>
        );
    }
  };

  return (
    <div className="w-64 bg-vc-surface border-l border-vc-border flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-vc-border p-4 flex justify-between items-center">
        <h3 className="font-semibold text-vc-text text-sm">Properties</h3>
        <button
          onClick={handleClose}
          className="p-1 hover:bg-vc-raised rounded"
        >
          <X size={16} className="text-vc-muted" />
        </button>
      </div>

      {/* Node Type */}
      <div className="px-4 py-3 border-b border-vc-border bg-vc-raised">
        <p className="text-xs text-vc-muted">Node type</p>
        <p className="font-medium text-sm text-vc-text capitalize">{node.type}</p>
      </div>

      {/* Properties */}
      <div className="flex-1 overflow-y-auto p-4">
        {renderNodeProperties()}
      </div>
    </div>
  );
};
