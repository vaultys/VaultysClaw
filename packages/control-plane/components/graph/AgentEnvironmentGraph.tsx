"use client";

/**
 * AgentEnvironmentGraph
 * ─────────────────────
 * A ReactFlow graph that shows the full runtime environment of a single agent:
 *
 *   Control Plane ──ws/webrtc──▶ Agent ──policy──▶ Internet / Files / LLM
 *                                       ──peer───▶ Other agents
 *                                       ──rag────▶ Knowledge sources
 *
 * Everything is read-only and security-oriented: in one glance an operator can
 * see what the agent is allowed to do and how it is connected.
 */

import { useEffect, useState, useMemo } from "react";
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  Handle,
  Position,
  NodeProps,
  MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  Bot,
  Server,
  Globe,
  FolderOpen,
  Brain,
  Users,
  BookOpen,
  ShieldOff,
  ShieldCheck,
  Mail,
  Plug,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { agentsClient, policiesClient, unwrap } from "@/lib/api/ts-rest/client";
import { AgentInfo } from "@/lib/contracts";

// ── Shared palette ─────────────────────────────────────────────────────────────
// Background is always the design-system surface so the graph adapts to light
// and dark mode automatically. Each kind gets a coloured left-border accent and
// a faint tinted background overlay via a semi-transparent rgba.

const PAL: Record<string, { accent: string; tint: string; glow: string }> = {
  agent: {
    accent: "rgb(var(--primary-500))",
    tint: "rgba(var(--primary-500),.07)",
    glow: "rgba(var(--primary-500),.18)",
  },
  cp: {
    accent: "rgb(var(--success-400))",
    tint: "rgba(var(--success-400),.06)",
    glow: "rgba(var(--success-400),.14)",
  },
  llm: {
    accent: "rgb(var(--warning-400))",
    tint: "rgba(var(--warning-400),.06)",
    glow: "rgba(var(--warning-400),.14)",
  },
  internet: {
    accent: "rgb(var(--success-400))",
    tint: "rgba(var(--success-400),.06)",
    glow: "rgba(var(--success-400),.14)",
  },
  files: {
    accent: "rgb(var(--primary-400))",
    tint: "rgba(var(--primary-400),.06)",
    glow: "rgba(var(--primary-400),.14)",
  },
  knowledge: {
    accent: "rgb(var(--secondary-400))",
    tint: "rgba(var(--secondary-400),.07)",
    glow: "rgba(var(--secondary-400),.15)",
  },
  peer: {
    accent: "rgb(var(--primary-300))",
    tint: "rgba(var(--primary-300),.05)",
    glow: "rgba(var(--primary-300),.12)",
  },
  peerOffline: {
    accent: "rgb(var(--neutral-500))",
    tint: "rgba(var(--neutral-500),.04)",
    glow: "rgba(var(--neutral-500),.08)",
  },
  mail: {
    accent: "rgb(var(--secondary-400))",
    tint: "rgba(var(--secondary-400),.06)",
    glow: "rgba(var(--secondary-400),.14)",
  },
  api: {
    accent: "rgb(var(--success-400))",
    tint: "rgba(var(--success-400),.06)",
    glow: "rgba(var(--success-400),.13)",
  },
  denied: {
    accent: "rgb(var(--danger-400))",
    tint: "rgba(var(--danger-400),.06)",
    glow: "rgba(var(--danger-400),.14)",
  },
};

const EDGE_COLORS = {
  transport: "rgb(var(--primary-500))",
  llm: "rgb(var(--warning-500))",
  internet: "rgb(var(--success-500))",
  files: "rgb(var(--primary-500))",
  knowledge: "rgb(var(--secondary-500))",
  peer: "rgb(var(--primary-300))",
  mail: "rgb(var(--secondary-400))",
  api: "rgb(var(--success-400))",
  denied: "rgb(var(--danger-500))",
} as const;

// ── Typed node data ────────────────────────────────────────────────────────────

type NodeKind =
  | "agent"
  | "cp"
  | "llm"
  | "internet"
  | "files"
  | "knowledge"
  | "peer"
  | "mail"
  | "api";

interface NodeData {
  kind: NodeKind;
  label: string;
  sublabel?: string;
  badge?: string;
  allowed?: boolean; // capability granted?
  offline?: boolean; // peer is offline — gray out
  rightAlign?: boolean; // right-align text (peer column)
  expiry?: string | null; // policy expiry for this cap (ISO or null = no expiry)
  domains?: string[]; // internet node domain allowlist
  docCount?: number; // knowledge node
}

// ── Reusable node card ─────────────────────────────────────────────────────────

const ICON_MAP: Record<NodeKind, React.ElementType> = {
  agent: Bot,
  cp: Server,
  llm: Brain,
  internet: Globe,
  files: FolderOpen,
  knowledge: BookOpen,
  peer: Users,
  mail: Mail,
  api: Plug,
};

// CSS-variable tokens for theme-aware text inside inline-styled ReactFlow nodes.
// Using the string form so the browser resolves them at paint time — they
// automatically switch when the `.dark` class is toggled on <html>.
const CV = {
  text: "rgb(var(--foreground-900))",
  muted: "rgb(var(--foreground-500))",
  subtle: "rgb(var(--foreground-400))",
  surface: "rgb(var(--background-100))",
  raised: "rgb(var(--background-200))",
  border: "rgb(var(--neutral-200))",
};

function EnvironmentNode({ data }: NodeProps<NodeData>) {
  const denied = data.allowed === false;
  const offline = data.offline === true;
  const palKey = denied ? "denied" : offline ? "peerOffline" : data.kind;
  const pal = PAL[palKey] ?? PAL.denied;
  const Icon = ICON_MAP[data.kind];
  const ra = data.rightAlign;

  return (
    <div
      style={{
        // Surface bg from design-system + coloured tint overlay
        background: `color-mix(in srgb, ${CV.surface} 100%, transparent)`,
        backgroundColor: CV.surface,
        // Left accent stripe expresses the node kind
        borderLeft: `3px solid ${pal.accent}`,
        borderTop: `1px solid ${CV.border}`,
        borderRight: `1px solid ${CV.border}`,
        borderBottom: `1px solid ${CV.border}`,
        borderRadius: "8px",
        padding: "9px 12px 9px 10px",
        minWidth: data.kind === "agent" ? "150px" : "130px",
        boxShadow: `0 2px 12px 0 ${pal.glow}`,
        fontFamily: "system-ui, sans-serif",
        opacity: offline ? 0.55 : 1,
        textAlign: ra ? "right" : "left",
        // Subtle tint on the background
        outline: `0 solid transparent`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Tinted background overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: pal.tint,
          pointerEvents: "none",
        }}
      />

      {/* One source + target per side — edges can exit/enter any face */}
      <Handle
        id="left-src"
        type="source"
        position={Position.Left}
        style={{ opacity: 0 }}
      />
      <Handle
        id="left-tgt"
        type="target"
        position={Position.Left}
        style={{ opacity: 0 }}
      />
      <Handle
        id="right-src"
        type="source"
        position={Position.Right}
        style={{ opacity: 0 }}
      />
      <Handle
        id="right-tgt"
        type="target"
        position={Position.Right}
        style={{ opacity: 0 }}
      />
      <Handle
        id="top-src"
        type="source"
        position={Position.Top}
        style={{ opacity: 0 }}
      />
      <Handle
        id="top-tgt"
        type="target"
        position={Position.Top}
        style={{ opacity: 0 }}
      />
      <Handle
        id="bottom-src"
        type="source"
        position={Position.Bottom}
        style={{ opacity: 0 }}
      />
      <Handle
        id="bottom-tgt"
        type="target"
        position={Position.Bottom}
        style={{ opacity: 0 }}
      />

      {/* Header row — reversed for right-aligned peer column */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          flexDirection: ra ? "row-reverse" : "row",
          gap: "6px",
          marginBottom: "3px",
        }}
      >
        {denied ? (
          <ShieldOff size={13} color={pal.accent} style={{ flexShrink: 0 }} />
        ) : (
          <Icon
            size={13}
            style={{ color: pal.accent, flexShrink: 0 } as React.CSSProperties}
          />
        )}
        <span
          style={{ fontWeight: 600, fontSize: "12px", color: CV.text, flex: 1 }}
        >
          {data.label}
        </span>
        {data.badge && (
          <span
            style={{
              fontSize: "9px",
              fontWeight: 700,
              padding: "1px 5px",
              borderRadius: "999px",
              background: pal.accent + "20",
              border: `1px solid ${pal.accent}60`,
              color: pal.accent,
              flexShrink: 0,
            }}
          >
            {data.badge}
          </span>
        )}
      </div>

      {/* Sublabel */}
      {data.sublabel && (
        <div
          style={{
            position: "relative",
            fontSize: "10px",
            color: CV.muted,
            fontFamily: "ui-monospace, monospace",
          }}
        >
          {data.sublabel}
        </div>
      )}

      {/* Domain allowlist */}
      {data.domains && data.domains.length > 0 && (
        <ul
          style={{
            position: "relative",
            marginTop: "3px",
            paddingLeft: 0,
            listStyle: "none",
          }}
        >
          {data.domains.slice(0, 4).map((d) => (
            <li
              key={d}
              style={{
                fontSize: "9px",
                color: pal.accent,
                fontFamily: "monospace",
              }}
            >
              · {d}
            </li>
          ))}
          {data.domains.length > 4 && (
            <li style={{ fontSize: "9px", color: CV.subtle }}>
              +{data.domains.length - 4} more
            </li>
          )}
        </ul>
      )}

      {/* Knowledge doc count */}
      {data.docCount !== undefined && (
        <div
          style={{
            position: "relative",
            fontSize: "10px",
            color: pal.accent,
            marginTop: "2px",
          }}
        >
          {data.docCount} doc{data.docCount !== 1 ? "s" : ""}
        </div>
      )}

      {/* Policy expiry */}
      {data.allowed && data.expiry !== undefined && (
        <div
          style={{
            position: "relative",
            fontSize: "9px",
            color: CV.subtle,
            marginTop: "3px",
            display: "flex",
            alignItems: "center",
            flexDirection: ra ? "row-reverse" : "row",
            gap: "3px",
          }}
        >
          <ShieldCheck size={9} color={pal.accent} />
          {data.expiry
            ? `exp ${new Date(data.expiry).toLocaleDateString()}`
            : "no expiry"}
        </div>
      )}

      {denied && (
        <div
          style={{
            position: "relative",
            fontSize: "9px",
            color: pal.accent,
            marginTop: "2px",
            fontStyle: "italic",
          }}
        >
          not granted
        </div>
      )}
    </div>
  );
}

const nodeTypes = { env: EnvironmentNode };

// ── Edge factory ───────────────────────────────────────────────────────────────

/**
 * Derive which handle sides to use so edges exit/enter the face that actually
 * points toward the target, rather than always right→left.
 *
 *   dx = targetX - sourceX,  dy = targetY - sourceY
 *   Dominant axis wins; diagonal threshold is 0.7 of the other axis.
 */
function handleSides(
  srcPos: { x: number; y: number },
  tgtPos: { x: number; y: number }
): { sourceHandle: string; targetHandle: string } {
  const dx = tgtPos.x - srcPos.x;
  const dy = tgtPos.y - srcPos.y;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);

  // Prefer horizontal when clearly wider than tall, vertical otherwise
  if (adx >= ady * 0.7) {
    // Horizontal dominant
    if (dx >= 0) return { sourceHandle: "right-src", targetHandle: "left-tgt" };
    else return { sourceHandle: "left-src", targetHandle: "right-tgt" };
  } else {
    // Vertical dominant
    if (dy >= 0) return { sourceHandle: "bottom-src", targetHandle: "top-tgt" };
    else return { sourceHandle: "top-src", targetHandle: "bottom-tgt" };
  }
}

function makeEdge(
  id: string,
  source: string,
  target: string,
  label: string,
  color: string,
  srcPos: { x: number; y: number },
  tgtPos: { x: number; y: number },
  opts: { animated?: boolean; dashed?: boolean; markerEnd?: boolean } = {}
): Edge {
  const { sourceHandle, targetHandle } = handleSides(srcPos, tgtPos);
  return {
    id,
    source,
    target,
    sourceHandle,
    targetHandle,
    label,
    animated: opts.animated ?? true,
    style: {
      stroke: color,
      strokeWidth: 1.8,
      strokeDasharray: opts.dashed ? "5,4" : undefined,
    },
    labelStyle: { fill: color, fontSize: 10, fontWeight: 600 },
    labelBgStyle: { fill: "transparent" },
    markerEnd:
      opts.markerEnd !== false
        ? { type: MarkerType.ArrowClosed, color, width: 14, height: 14 }
        : undefined,
  };
}

// ── Data fetching ──────────────────────────────────────────────────────────────

interface Policy {
  id: string;
  capabilities: string[];
  resourceLimits: {
    allowedDomains?: string[];
    maxTokensPerDay?: number;
    maxRequestsPerHour?: number;
  } | null;
  expiresAt: string | null;
}

interface KnowledgeSource {
  id: string;
  name: string;
  source_type: string;
  doc_count: number;
  status: string;
}

interface GraphData {
  agents: AgentInfo[];
  policies: Policy[];
  knowledge: KnowledgeSource[];
}

// ── Layout constants ───────────────────────────────────────────────────────────

const COL = { agent: 180, right: 820 };
const PEER_COL_X = -340; // left edge of peer column
const ROW_GAP = 90;
const NODE_H = 80; // approximate rendered node height (px)
const TOP_PAD = NODE_H + 20; // vertical space reserved at top for knowledge row
const KS_OFFSET = -(NODE_H + 250); // knowledge sits exactly one box-height above agent
const KS_SPACING = 170; // horizontal gap between knowledge node centres

// ── Main component ─────────────────────────────────────────────────────────────

interface AgentEnvironmentGraphProps {
  agentId: string;
  agentName: string;
  transport: "ws" | "peerjs" | null | undefined;
  online: boolean;
  reportedLlm: { provider: string; model: string } | null;
  capabilities: string[];
}

export default function AgentEnvironmentGraph({
  agentId,
  agentName,
  transport,
  online,
  reportedLlm,
  capabilities,
}: AgentEnvironmentGraphProps) {
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [agentsRes, policiesRes, knowledgeRes] = await Promise.all([
          agentsClient.search(),
          policiesClient.list({ query: { agentDid: agentId } }),
          fetch(`/api/knowledge?agentDid=${encodeURIComponent(agentId)}`),
        ]);
        const knowledgeJson = knowledgeRes.ok
          ? await knowledgeRes.json()
          : { sources: [] };
        setData({
          agents: (unwrap(agentsRes).items ?? []).filter(
            (a) => a.did !== agentId
          ),
          policies: unwrap(policiesRes).policies,
          knowledge: knowledgeJson.sources ?? [],
        });
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to load graph data");
      } finally {
        setLoading(false);
      }
    })();
  }, [agentId]);

  const { nodes, edges } = useMemo(() => {
    if (!data) return { nodes: [], edges: [] };

    const nodes: Node<NodeData>[] = [];
    const edges: Edge[] = [];

    // Position registry — makeEdge reads this to decide which handle sides to use
    const pos: Record<string, { x: number; y: number }> = {};
    function addNode(node: Node<NodeData>) {
      pos[node.id] = node.position;
      nodes.push(node);
    }

    // Normal edge: handle sides derived from relative position
    function edge(
      id: string,
      src: string,
      tgt: string,
      label: string,
      color: string,
      opts: { animated?: boolean; dashed?: boolean; markerEnd?: boolean } = {}
    ) {
      edges.push(
        makeEdge(id, src, tgt, label, color, pos[src], pos[tgt], opts)
      );
    }

    // Forced horizontal edge: always left↔right regardless of exact positions
    function edgeH(
      id: string,
      src: string,
      tgt: string,
      label: string,
      color: string,
      opts: { animated?: boolean; dashed?: boolean } = {}
    ) {
      const srcX = pos[src].x,
        tgtX = pos[tgt].x;
      const srcHandle = srcX < tgtX ? "right-src" : "left-src";
      const tgtHandle = srcX < tgtX ? "left-tgt" : "right-tgt";
      edges.push({
        id,
        source: src,
        target: tgt,
        sourceHandle: srcHandle,
        targetHandle: tgtHandle,
        label,
        animated: opts.animated ?? true,
        style: {
          stroke: color,
          strokeWidth: 1.8,
          strokeDasharray: opts.dashed ? "5,4" : undefined,
        },
        labelStyle: { fill: color, fontSize: 10, fontWeight: 600 },
        labelBgStyle: { fill: "transparent" },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color,
          width: 14,
          height: 14,
        },
      });
    }

    // ── Capability → earliest-expiry lookup ──────────────────────────────────
    const capExpiry: Record<string, string | null> = {};
    for (const p of data.policies) {
      for (const cap of p.capabilities) {
        if (!(cap in capExpiry)) {
          capExpiry[cap] = p.expiresAt;
        } else if (capExpiry[cap] !== null && p.expiresAt !== null) {
          capExpiry[cap] =
            capExpiry[cap]! < p.expiresAt ? capExpiry[cap] : p.expiresAt;
        } else {
          capExpiry[cap] = null; // null = permanent
        }
      }
    }
    // Only policy-granted caps count as "allowed".
    // `capabilities` is what the agent *requests* — not what has been granted.
    const hasCap = (c: string) => c in capExpiry;
    const expiry = (c: string) => (c in capExpiry ? capExpiry[c] : undefined);
    const allowedDomains = data.policies
      .flatMap((p) => p.resourceLimits?.allowedDomains ?? [])
      .filter(Boolean);
    const llm = reportedLlm;

    // ── Peers: only show when agent_communication is granted ─────────────────
    const hasAgentComm = hasCap("agent_communication");
    const sortedPeers = hasAgentComm
      ? [...data.agents]
          .sort((a, b) => {
            if (a.online !== b.online) return a.online ? -1 : 1;
            return b.name.length - a.name.length;
          })
          .slice(0, 8)
      : [];
    const peerCount = sortedPeers.length;

    // ── Vertical layout derived from peer count ───────────────────────────────
    const agentY =
      TOP_PAD +
      (peerCount > 0 ? Math.round(((peerCount - 1) * ROW_GAP) / 2) : 0);
    const cpY = TOP_PAD + (peerCount > 0 ? peerCount * ROW_GAP : ROW_GAP) + 20;
    const rightY0 = TOP_PAD;

    // ── Peers (left column) ───────────────────────────────────────────────────
    sortedPeers.forEach((peer, i) => {
      addNode({
        id: `peer-${peer.did}`,
        type: "env",
        position: { x: PEER_COL_X, y: TOP_PAD + i * ROW_GAP },
        data: {
          kind: "peer",
          label: peer.name,
          badge: peer.online ? "online" : "offline",
          offline: !peer.online,
          rightAlign: true,
        },
      });
    });

    // ── Agent ─────────────────────────────────────────────────────────────────
    addNode({
      id: "agent",
      type: "env",
      position: { x: COL.agent, y: agentY },
      data: {
        kind: "agent",
        label: agentName,
        badge: online ? "online" : "offline",
      },
    });

    // Peer edges (drawn after agent so pos["agent"] is set)
    sortedPeers.forEach((peer) => {
      edgeH(
        `e-peer-${peer.did}`,
        "agent",
        `peer-${peer.did}`,
        "",
        peer.online ? EDGE_COLORS.peer : "#9ca3af",
        { animated: peer.online, dashed: false }
      );
    });

    // ── Control Plane (below agent) ───────────────────────────────────────────
    addNode({
      id: "cp",
      type: "env",
      position: { x: COL.agent, y: cpY },
      data: {
        kind: "cp",
        label: "Control Plane",
        sublabel: transport === "peerjs" ? "WebRTC / PeerJS" : "WebSocket",
      },
    });
    edge(
      "e-cp-agent",
      "agent",
      "cp",
      transport === "peerjs" ? "WebRTC" : "WebSocket",
      EDGE_COLORS.transport
    );

    // ── LLM ───────────────────────────────────────────────────────────────────
    let rightRow = 0;
    if (llm) {
      addNode({
        id: "llm",
        type: "env",
        position: { x: COL.right, y: rightY0 + rightRow * ROW_GAP },
        data: { kind: "llm", label: llm.provider, sublabel: llm.model },
      });
      edge("e-agent-llm", "agent", "llm", "LLM", EDGE_COLORS.llm);
      rightRow++;
    }

    // ── Right-side capability nodes — only render granted caps ────────────────
    const hasInternet = hasCap("internet_access") || hasCap("browser_control");
    if (hasInternet) {
      const internetExpiry =
        expiry("internet_access") ?? expiry("browser_control");
      addNode({
        id: "internet",
        type: "env",
        position: { x: COL.right, y: rightY0 + rightRow * ROW_GAP },
        data: {
          kind: "internet",
          label: "Internet",
          expiry: internetExpiry,
          sublabel:
            allowedDomains.length > 0
              ? `${allowedDomains.length} domain${allowedDomains.length !== 1 ? "s" : ""} allowed`
              : "unrestricted",
          domains: allowedDomains,
        },
      });
      edge(
        "e-agent-internet",
        "agent",
        "internet",
        allowedDomains.length > 0 ? "filtered" : "open",
        EDGE_COLORS.internet,
        { animated: true }
      );
      rightRow++;
    }

    const hasFiles = hasCap("file_access");
    if (hasFiles) {
      addNode({
        id: "files",
        type: "env",
        position: { x: COL.right, y: rightY0 + rightRow * ROW_GAP },
        data: {
          kind: "files",
          label: "File System",
          expiry: expiry("file_access"),
          sublabel: "workspace/",
        },
      });
      edge(
        "e-agent-files",
        "agent",
        "files",
        "read / write",
        EDGE_COLORS.files,
        { animated: true }
      );
      rightRow++;
    }

    const hasCode = hasCap("code_execution") || hasCap("system_command");
    if (hasCode) {
      addNode({
        id: "code",
        type: "env",
        position: { x: COL.right, y: rightY0 + rightRow * ROW_GAP },
        data: {
          kind: "files",
          label: "Code Execution",
          expiry: expiry("code_execution") ?? expiry("system_command"),
          sublabel: hasCap("system_command") ? "shell + code" : "sandbox",
        },
      });
      edge("e-agent-code", "agent", "code", "execute", EDGE_COLORS.files, {
        animated: true,
      });
      rightRow++;
    }

    const hasMail = hasCap("mail_send");
    if (hasMail) {
      addNode({
        id: "mail",
        type: "env",
        position: { x: COL.right, y: rightY0 + rightRow * ROW_GAP },
        data: {
          kind: "mail",
          label: "Mail",
          expiry: expiry("mail_send"),
          sublabel: "SMTP / send",
        },
      });
      edge("e-agent-mail", "agent", "mail", "send", EDGE_COLORS.mail, {
        animated: true,
      });
      rightRow++;
    }

    const hasApi = hasCap("api_call");
    if (hasApi) {
      addNode({
        id: "api",
        type: "env",
        position: { x: COL.right, y: rightY0 + rightRow * ROW_GAP },
        data: {
          kind: "api",
          label: "API Calls",
          expiry: expiry("api_call"),
          sublabel: "HTTP / external",
        },
      });
      edge("e-agent-api", "agent", "api", "call", EDGE_COLORS.api, {
        animated: true,
      });
      rightRow++;
    }

    // ── Knowledge sources — only if knowledge_search is granted ───────────────
    const hasKnowledge = hasCap("knowledge_search");
    if (hasKnowledge) {
      const ksCount = data.knowledge.length;
      data.knowledge.forEach((ks, i) => {
        const nodeId = `ks-${ks.id}`;
        addNode({
          id: nodeId,
          type: "env",
          position: {
            x: COL.agent + KS_SPACING * (i - (ksCount - 1) / 2),
            y: agentY + KS_OFFSET,
          },
          data: {
            kind: "knowledge",
            label: ks.name,
            sublabel: ks.source_type,
            docCount: ks.doc_count,
            badge: ks.status,
            expiry: expiry("knowledge_search"),
          },
        });
        edge(
          `e-agent-ks-${ks.id}`,
          "agent",
          nodeId,
          "RAG",
          EDGE_COLORS.knowledge,
          { animated: ks.status === "ready" }
        );
      });
    }

    return { nodes, edges };
  }, [data, agentId, agentName, transport, online, reportedLlm, capabilities]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[520px]">
        <Loader2 size={24} className="animate-spin text-primary-400" />
      </div>
    );
  }
  if (err) {
    return (
      <div className="flex items-center gap-2 h-[520px] justify-center text-sm text-danger-400">
        <AlertTriangle size={14} />
        {err}
      </div>
    );
  }

  return (
    <div className="relative" style={{ height: "560px" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable
        panOnDrag
        zoomOnScroll
        proOptions={{ hideAttribution: true }}
      >
        <Background color="rgb(var(--neutral-200))" gap={24} />
        <Controls />
      </ReactFlow>

      <style>{`
        .react-flow__controls button {
          background: rgb(var(--background-100)) !important;
          border: 1px solid rgb(var(--neutral-200)) !important;
          color: rgb(var(--foreground-500)) !important;
        }
        .react-flow__controls button:hover {
          background: rgb(var(--background-200)) !important;
          color: rgb(var(--foreground-900)) !important;
        }
        .react-flow__edge-label { pointer-events: none; }
      `}</style>
    </div>
  );
}
