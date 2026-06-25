"use client";

import { useState } from "react";
import { ArrowRight, Check, Copy } from "lucide-react";
import type { FlowNode, WorkflowEdge } from "./types";

/** Shows predecessor nodes and clickable variable tokens for output wiring. */
export function PredecessorInputs({
  nodeId,
  nodes,
  edges,
  onInsert,
}: {
  nodeId: string;
  nodes: FlowNode[];
  edges: WorkflowEdge[];
  onInsert: (variable: string) => void;
}) {
  const [copiedVar, setCopiedVar] = useState<string | null>(null);

  const predecessors = edges
    .filter((e) => e.target === nodeId)
    .map((e) => nodes.find((n) => n.id === e.source))
    .filter((n): n is FlowNode => Boolean(n));

  if (predecessors.length === 0) return null;

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
        {predecessors.map((pred) => {
          const label = pred.data?.label ?? pred.id;
          return (
            <div key={pred.id} className="space-y-1">
              <p className="text-xs font-medium text-foreground truncate">
                {label}
              </p>
              <div className="flex flex-wrap gap-1">
                {[
                  `\${${pred.id}}`,
                  `\${${pred.id}.status}`,
                  `\${${pred.id}.message}`,
                  `\${${pred.id}.output}`,
                ].map((v) => (
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
}
