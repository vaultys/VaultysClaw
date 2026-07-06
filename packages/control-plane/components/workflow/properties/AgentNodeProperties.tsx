"use client";

import type { RefObject } from "react";
import type { WorkflowMembers } from "@/hooks/useWorkflowMembers";
import { AgentSelect } from "./AgentSelect";
import { PredecessorInputs } from "./PredecessorInputs";
import type {
  FlowNode,
  UpdateNodeData,
  UpdateNodeFields,
  WorkflowEdge,
} from "./types";

export function AgentNodeProperties({
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
  // Auto-wire reset: input should equal `${predecessorId}`
  const srcId = edges.find((e) => e.target === node.id)?.source;
  const expectedInput = srcId ? `\${${srcId}}` : null;
  const currentInput = node.data.params?.input;
  const showReset = !!expectedInput && currentInput !== expectedInput;

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground-700 mb-2">
          Agent
        </label>
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
              agentName: name || undefined,
            })
          }
          emptyOptionLabel="-- Select agent --"
          showCount
        />
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
          {showReset && (
            <button
              onClick={() =>
                updateNodeData("params", {
                  ...(node.data.params ?? {}),
                  input: expectedInput,
                })
              }
              className="text-[10px] text-primary-700 hover:text-primary-300 border border-primary-300 px-1.5 py-0.5 rounded"
            >
              ↺ Reset auto-wire
            </button>
          )}
        </div>

        <div className="mb-2 rounded border border-neutral-200 bg-background-200/60 p-2 space-y-1 text-xs text-foreground-500">
          <p className="font-semibold text-foreground">How params work</p>
          <p>
            The <strong>full params object</strong> is sent to the agent — every
            key/value pair, not just <code className="font-mono">input</code>.
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
              /* invalid JSON, ignore */
            }
          }}
          className="w-full px-3 py-2 bg-background-100 text-foreground border border-neutral-200 rounded-md text-xs font-mono focus:ring-2 focus:ring-primary-500 focus:border-transparent h-24"
          placeholder="{&#10; &#34;input&#34;: &#34;${prevNodeId}&#34;&#10;}"
        />
      </div>
    </div>
  );
}
