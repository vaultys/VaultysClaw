import { Edge, Node } from "reactflow";
import { makeEdge, makeHorizontalEdge } from "./edges";
import { EDGE_COLORS, type NodeData } from "./palette";
import {
  COL,
  KS_OFFSET,
  KS_SPACING,
  PEER_COL_X,
  ROW_GAP,
  TOP_PAD,
  type GraphData,
} from "./types";

interface BuildParams {
  agentName: string;
  transport: "ws" | "peerjs" | null | undefined;
  online: boolean;
  reportedLlm: { provider: string; model: string } | null;
}

/**
 * Pure layout: turns the fetched environment data + agent params into the
 * ReactFlow nodes and edges. The right column lists only policy-granted
 * capabilities; peers only appear when `agent_communication` is granted.
 */
export function buildEnvironmentGraph(
  data: GraphData,
  { agentName, transport, online, reportedLlm }: BuildParams
): { nodes: Node<NodeData>[]; edges: Edge[] } {
  const nodes: Node<NodeData>[] = [];
  const edges: Edge[] = [];

  // Position registry — edges read this to pick handle sides.
  const pos: Record<string, { x: number; y: number }> = {};
  const addNode = (node: Node<NodeData>) => {
    pos[node.id] = node.position;
    nodes.push(node);
  };

  const edge = (
    id: string,
    src: string,
    tgt: string,
    label: string,
    color: string,
    opts: { animated?: boolean; dashed?: boolean; markerEnd?: boolean } = {}
  ) => edges.push(makeEdge(id, src, tgt, label, color, pos[src], pos[tgt], opts));

  const edgeH = (
    id: string,
    src: string,
    tgt: string,
    label: string,
    color: string,
    opts: { animated?: boolean; dashed?: boolean } = {}
  ) =>
    edges.push(
      makeHorizontalEdge(id, src, tgt, label, color, pos[src].x, pos[tgt].x, opts)
    );

  // ── Capability → earliest-expiry lookup ──
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
  // Only policy-granted caps count as "allowed" (not what the agent requests).
  const hasCap = (c: string) => c in capExpiry;
  const expiry = (c: string) => (c in capExpiry ? capExpiry[c] : undefined);
  const allowedDomains = data.policies
    .flatMap((p) => p.resourceLimits?.allowedDomains ?? [])
    .filter(Boolean);

  // ── Peers: only when agent_communication is granted ──
  const sortedPeers = hasCap("agent_communication")
    ? [...data.agents]
        .sort((a, b) => {
          if (a.online !== b.online) return a.online ? -1 : 1;
          return b.name.length - a.name.length;
        })
        .slice(0, 8)
    : [];
  const peerCount = sortedPeers.length;

  // ── Vertical layout derived from peer count ──
  const agentY =
    TOP_PAD + (peerCount > 0 ? Math.round(((peerCount - 1) * ROW_GAP) / 2) : 0);
  const cpY = TOP_PAD + (peerCount > 0 ? peerCount * ROW_GAP : ROW_GAP) + 20;
  const rightY0 = TOP_PAD;

  // ── Peers (left column) ──
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

  // ── Agent ──
  addNode({
    id: "agent",
    type: "env",
    position: { x: COL.agent, y: agentY },
    data: { kind: "agent", label: agentName, badge: online ? "online" : "offline" },
  });

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

  // ── Control Plane (below agent) ──
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

  // ── LLM ──
  let rightRow = 0;
  if (reportedLlm) {
    addNode({
      id: "llm",
      type: "env",
      position: { x: COL.right, y: rightY0 + rightRow * ROW_GAP },
      data: { kind: "llm", label: reportedLlm.provider, sublabel: reportedLlm.model },
    });
    edge("e-agent-llm", "agent", "llm", "LLM", EDGE_COLORS.llm);
    rightRow++;
  }

  // ── Right-side capability nodes — only granted caps ──
  if (hasCap("internet_access") || hasCap("browser_control")) {
    addNode({
      id: "internet",
      type: "env",
      position: { x: COL.right, y: rightY0 + rightRow * ROW_GAP },
      data: {
        kind: "internet",
        label: "Internet",
        expiry: expiry("internet_access") ?? expiry("browser_control"),
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

  if (hasCap("file_access")) {
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
    edge("e-agent-files", "agent", "files", "read / write", EDGE_COLORS.files, {
      animated: true,
    });
    rightRow++;
  }

  if (hasCap("code_execution") || hasCap("system_command")) {
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

  if (hasCap("mail_send")) {
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

  if (hasCap("api_call")) {
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

  // ── Knowledge sources — only if knowledge_search is granted ──
  if (hasCap("knowledge_search")) {
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
      edge(`e-agent-ks-${ks.id}`, "agent", nodeId, "RAG", EDGE_COLORS.knowledge, {
        animated: ks.status === "ready",
      });
    });
  }

  return { nodes, edges };
}
