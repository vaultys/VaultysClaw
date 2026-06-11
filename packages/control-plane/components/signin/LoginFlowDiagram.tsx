"use client";

import { useCallback, useMemo, useState } from "react";
import ReactFlow, {
  Node,
  Edge,
  Background,
  BackgroundVariant,
  Handle,
  Position,
  NodeProps,
} from "reactflow";
import "reactflow/dist/style.css";
import { Shield, Fingerprint, Bot, X } from "lucide-react";
import Connect from "./Connect";

// ─── Shared handle style ──────────────────────────────────────────────────────

const H: React.CSSProperties = {
  background: "primary",
  border: "1px solid #4338ca",
  width: 8,
  height: 8,
};

// ─── Identity node ────────────────────────────────────────────────────────────

const IdentityNode: React.FC<NodeProps> = () => (
  <div className="vc-node-card rounded-2xl px-5 py-4 w-[280px]">
    <Handle type="source" position={Position.Bottom} style={H} />
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 bg-primary-500/10 border border-primary-400/30 rounded-xl flex items-center justify-center shrink-0">
        <Fingerprint className="w-5 h-5 text-primary-400" />
      </div>
      <div>
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold vc-text">VaultysID Identity</p>
          <span className="text-[10px] font-bold bg-primary-100/60 vc-text-brand border border-primary-300/50 px-1.5 py-0.5 rounded-full">
            PQC
          </span>
        </div>
        <p className="text-xs vc-text-subtle">
          Self-sovereign · Hardware-backed
        </p>
      </div>
    </div>
  </div>
);

// ─── Control plane node ───────────────────────────────────────────────────────
// No <button> inside — click is handled by ReactFlow's onNodeClick callback.

const ControlPlaneNode: React.FC<NodeProps> = () => (
  <div className="bg-primary-600/20 border border-primary-500/60 rounded-2xl px-5 py-5 w-[360px] backdrop-blur-sm animate-pulse-glow group">
    <Handle type="target" position={Position.Top} style={H} />
    <Handle
      type="source"
      position={Position.Bottom}
      id="a"
      style={{ ...H, left: "20%" }}
    />
    <Handle
      type="source"
      position={Position.Bottom}
      id="b"
      style={{ ...H, left: "50%" }}
    />
    <Handle
      type="source"
      position={Position.Bottom}
      id="c"
      style={{ ...H, left: "80%" }}
    />

    <div className="flex items-center gap-3 mb-4">
      <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center shrink-0 shadow shadow-primary-600/50">
        <Shield className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-sm font-semibold vc-text">
          VaultysClaw Control Plane
        </p>
        <p className="text-[11px] vc-text-subtle">
          Policy enforcement · Audit trail · Intent routing
        </p>
      </div>
    </div>

    {/* Visual CTA — click is handled at the ReactFlow level via onNodeClick */}
    <div className="w-full relative overflow-hidden flex items-center justify-center gap-2 bg-primary-600 group-hover:bg-primary-500 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors shadow shadow-primary-600/30">
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
        />
      </svg>
      Sign in with VaultysID
    </div>
  </div>
);

// ─── Agent node ───────────────────────────────────────────────────────────────

interface AgentData {
  label: string;
  delay: number;
}

const AgentNode: React.FC<NodeProps<AgentData>> = ({ data }) => (
  <div className="vc-node-card rounded-xl px-4 py-3 w-[140px] flex flex-col items-center gap-2">
    <Handle type="target" position={Position.Top} style={H} />
    <div className="relative">
      <div className="w-9 h-9 bg-background-200/60 border border-neutral-200/60 rounded-lg flex items-center justify-center">
        <Bot className="w-4 h-4 vc-text-subtle" />
      </div>
      <span
        className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-success-500 rounded-full animate-pulse"
        style={{ animationDelay: `${data.delay}s` }}
      />
    </div>
    <p className="text-xs vc-text-subtle font-medium">{data.label}</p>
  </div>
);

// ─── Static graph data ────────────────────────────────────────────────────────

const NODE_TYPES = {
  identity: IdentityNode,
  controlPlane: ControlPlaneNode,
  agent: AgentNode,
};

const LABEL_STYLE: React.CSSProperties = {
  fill: "rgb(var(--primary-700))",
  fontSize: 10,
  fontFamily: "monospace",
};
const LABEL_BG: React.CSSProperties = {
  fill: "rgb(var(--primary-100))",
  fillOpacity: 0.9,
};
const EDGE_STYLE: React.CSSProperties = { stroke: "primary", strokeWidth: 1.5 };

const EDGES: Edge[] = [
  {
    id: "e-id-cp",
    source: "identity",
    target: "controlPlane",
    animated: true,
    label: "signed WebSocket",
    labelStyle: LABEL_STYLE,
    labelBgStyle: LABEL_BG,
    style: EDGE_STYLE,
  },
  {
    id: "e-cp-a",
    source: "controlPlane",
    sourceHandle: "a",
    target: "agentA",
    animated: true,
    label: "delegation cert",
    labelStyle: LABEL_STYLE,
    labelBgStyle: LABEL_BG,
    style: EDGE_STYLE,
  },
  {
    id: "e-cp-b",
    source: "controlPlane",
    sourceHandle: "b",
    target: "agentB",
    animated: true,
    style: EDGE_STYLE,
  },
  {
    id: "e-cp-c",
    source: "controlPlane",
    sourceHandle: "c",
    target: "agentC",
    animated: true,
    label: "delegation cert",
    labelStyle: LABEL_STYLE,
    labelBgStyle: LABEL_BG,
    style: EDGE_STYLE,
  },
];

// Nodes are all horizontally centred around x = 180:
// identity (280 px wide) x=40 → centre 180
// ctrlPlane (360 px wide) x=0 → centre 180
// agents (140 px wide) x=-50, 110, 270 → centres 20, 180, 340
const NODES: Node[] = [
  {
    id: "identity",
    type: "identity",
    draggable: false,
    selectable: false,
    position: { x: 40, y: 20 },
    data: {},
  },
  {
    id: "controlPlane",
    type: "controlPlane",
    draggable: false,
    selectable: false,
    position: { x: 0, y: 200 },
    data: {},
  },
  {
    id: "agentA",
    type: "agent",
    draggable: false,
    selectable: false,
    position: { x: -50, y: 420 },
    data: { label: "Agent A", delay: 0 },
  },
  {
    id: "agentB",
    type: "agent",
    draggable: false,
    selectable: false,
    position: { x: 110, y: 420 },
    data: { label: "Agent B", delay: 0.5 },
  },
  {
    id: "agentC",
    type: "agent",
    draggable: false,
    selectable: false,
    position: { x: 270, y: 420 },
    data: { label: "Agent C", delay: 1 },
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function LoginFlowDiagram() {
  const [showModal, setShowModal] = useState(false);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.id === "controlPlane") setShowModal(true);
  }, []);

  return (
    <div className="rf-login relative w-full h-full">
      <ReactFlow
        nodes={NODES}
        edges={EDGES}
        nodeTypes={NODE_TYPES}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        panOnScroll={false}
        panOnDrag={false}
        preventScrolling={false}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="rgba(99,102,241,0.2)"
        />
      </ReactFlow>

      {showModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 vc-overlay">
          <div className="relative animate-fade-in-up">
            <button
              onClick={() => setShowModal(false)}
              className="absolute -top-3 -right-3 z-10 w-8 h-8 rounded-full vc-bg-elevated border vc-border vc-text-muted hover:text-foreground-900 hover:bg-background-300 transition-colors shadow-lg"
            >
              <X className="w-4 h-4" />
            </button>
            <Connect embedded />
          </div>
        </div>
      )}
    </div>
  );
}
