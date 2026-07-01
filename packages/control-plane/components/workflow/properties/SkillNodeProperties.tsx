"use client";

import type { RefObject } from "react";
import type { WorkflowMembers } from "@/hooks/useWorkflowMembers";
import { AgentSelect } from "./AgentSelect";
import { PredecessorInputs } from "./PredecessorInputs";
import {
  SKILL_CATALOG,
  type FlowNode,
  type UpdateNodeData,
  type UpdateNodeFields,
  type WorkflowEdge,
} from "./types";

export function SkillNodeProperties({
  node,
  nodes,
  edges,
  members,
  updateNodeData,
  updateNodeFields,
  insertIntoParams,
  paramsTextRef,
}: {
  node: FlowNode;
  nodes: FlowNode[];
  edges: WorkflowEdge[];
  members: WorkflowMembers;
  updateNodeData: UpdateNodeData;
  updateNodeFields: UpdateNodeFields;
  insertIntoParams: (variable: string) => void;
  paramsTextRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const skillName = node.data.skillName ?? "";
  const toolName = node.data.toolName ?? "";
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
          onChange={(e) =>
            updateNodeFields({
              skillName: e.target.value || undefined,
              toolName: undefined, // reset tool when skill changes
            })
          }
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
          Leave blank to auto-select a capable agent in the workspace.
        </p>
        <AgentSelect
          value={node.data.agentId ?? ""}
          agents={members.agents}
          filteredAgents={members.filteredAgents}
          loading={members.loading}
          searchQuery={members.searchQuery}
          setSearchQuery={members.setSearchQuery}
          onChange={(did, name) =>
            updateNodeFields({
              agentId: did || undefined,
              agentName: name,
            })
          }
          emptyOptionLabel="— auto —"
        />
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
          <code className="font-mono text-success-600">$&#123;nodeId&#125;</code>{" "}
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
}
