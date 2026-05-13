"use client";

import React, { useState, useEffect } from "react";
import { X, Bot, Search } from "lucide-react";
import { useWorkflowStore } from "./store";
import type { WorkflowNode } from "@/lib/workflow-executor";

interface Agent {
  id: string;
  name: string;
  capabilities: string[];
  online: boolean;
}

export const PropertiesPanel: React.FC<{
  nodes: any[];
  setNodes: (nodes: any[]) => void;
}> = ({ nodes, setNodes }) => {
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const workflowRealmId = useWorkflowStore((s) => s.workflowRealmId);

  const [agents, setAgents] = useState<Agent[]>([]);
  const [filteredAgents, setFilteredAgents] = useState<Agent[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);

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

  if (!selectedNodeId) {
    return (
      <div className="w-64 bg-gray-50 border-l border-gray-200 p-4 text-center text-gray-500 text-sm">
        Select a node to configure
      </div>
    );
  }

  const node = nodes.find((n) => n.id === selectedNodeId) as any;
  if (!node) {
    return (
      <div className="w-64 bg-gray-50 border-l border-gray-200 p-4 text-center text-gray-500 text-sm">
        Node not found
      </div>
    );
  }

  const handleClose = () => {
    setSelectedNode(null);
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
              <label className="block text-sm font-medium text-gray-700 mb-2">Agent</label>

              {/* Search Box */}
              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search agents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              {/* Agent Select */}
              <select
                value={node.data.agentId || ""}
                onChange={(e) => updateNodeData("agentId", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent max-h-48"
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
                <p className="text-xs text-gray-500 mt-1">
                  {filteredAgents.length} agent{filteredAgents.length !== 1 ? "s" : ""} found
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Parameters</label>
              <textarea
                value={JSON.stringify(node.data.params || {}, null, 2)}
                onChange={(e) => {
                  try {
                    updateNodeData("params", JSON.parse(e.target.value));
                  } catch {
                    // Invalid JSON, ignore
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent h-24"
                placeholder="{&#10;  &#34;key&#34;: &#34;value&#34;&#10;}"
              />
              <p className="text-xs text-gray-500 mt-1">JSON format. Use $&#123;stepId.field&#125; for interpolation.</p>
            </div>
          </div>
        );

      case "condition":
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expression</label>
              <textarea
                value={node.data.expression || ""}
                onChange={(e) => updateNodeData("expression", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-xs font-mono focus:ring-2 focus:ring-orange-500 focus:border-transparent h-20"
                placeholder="e.g., output.status === 'success' && output.confidence > 0.8"
              />
              <p className="text-xs text-gray-500 mt-1">JavaScript expression. Returns true/false to route execution.</p>
            </div>
          </div>
        );

      case "delay":
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duration (seconds)</label>
              <input
                type="number"
                value={node.data.duration || 1}
                onChange={(e) => updateNodeData("duration", parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent"
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Agents (one per line)</label>
              <textarea
                value={(node.data.agents as string[] | undefined)?.join("\n") || ""}
                onChange={(e) => updateNodeData("agents", e.target.value.split("\n").filter((a) => a.trim()))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-xs font-mono focus:ring-2 focus:ring-purple-500 focus:border-transparent h-24"
                placeholder="agent-1&#10;agent-2&#10;agent-3"
              />
            </div>
          </div>
        );

      case "label":
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Label Text</label>
              <textarea
                value={node.data.text || ""}
                onChange={(e) => updateNodeData("text", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent h-24"
                placeholder="Enter label text..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
              <div className="grid grid-cols-4 gap-2">
                {["yellow", "pink", "blue", "green", "purple", "red", "amber", "cyan"].map((color) => (
                  <button
                    key={color}
                    onClick={() => updateNodeData("color", color)}
                    className={`w-8 h-8 rounded border-2 capitalize text-xs font-bold transition-all ${node.data.color === color ? "border-gray-900 ring-2 ring-offset-1 ring-gray-900" : "border-gray-300"
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

      default:
        return (
          <div className="text-sm text-gray-500">
            No properties available for {node.type} nodes
          </div>
        );
    }
  };

  return (
    <div className="w-64 bg-white border-l border-gray-200 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-gray-200 p-4 flex justify-between items-center">
        <h3 className="font-semibold text-gray-900 text-sm">Properties</h3>
        <button
          onClick={handleClose}
          className="p-1 hover:bg-gray-100 rounded"
        >
          <X size={16} />
        </button>
      </div>

      {/* Node Type */}
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <p className="text-xs text-gray-600">Node type</p>
        <p className="font-medium text-sm text-gray-900 capitalize">{node.type}</p>
      </div>

      {/* Properties */}
      <div className="flex-1 overflow-y-auto p-4">
        {renderNodeProperties()}
      </div>
    </div>
  );
};
