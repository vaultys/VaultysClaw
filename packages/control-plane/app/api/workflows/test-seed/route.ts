import { NextRequest, NextResponse } from "next/server";
import { saveWorkflow, getAllAgents, getDefaultRealm } from "@/lib/db";
import { getWSServer } from "@/lib/ws-server";
import type { WorkflowDefinition } from "@/lib/db";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";

/**
 * POST /api/workflows/test-seed
 * Create a test workflow with 4 real agents in sequence. Global admin only.
 * Requires 4 agents to be online and registered
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) return unauthorized();
    if (!auth.isGlobalAdmin) return forbidden();

    const wsServer = getWSServer();
    if (!wsServer) {
      return NextResponse.json({ error: "WebSocket server not available" }, { status: 500 });
    }

    // Get connected agents
    const dbAgents = getAllAgents();
    const connectedAgents = wsServer.getConnectedAgents().slice(0, 4);

    if (connectedAgents.length < 4) {
      return NextResponse.json(
        {
          error: `Not enough agents connected. Found ${connectedAgents.length}, need 4`,
          available: connectedAgents.length,
        },
        { status: 400 }
      );
    }

    const connectedAgentIds = connectedAgents.map((a) => a.id);
    const agents = connectedAgentIds
      .map((did) => dbAgents.find((a) => a.did === did))
      .filter((a): a is NonNullable<typeof a> => a != null);

    if (agents.length < 4) {
      return NextResponse.json(
        { error: "Could not find agent details", available: agents.length },
        { status: 400 }
      );
    }

    // Get default realm
    const defaultRealm = getDefaultRealm();
    if (!defaultRealm) {
      return NextResponse.json({ error: "No default realm found" }, { status: 500 });
    }

    // Use the first agent's first capability, or fallback to a generic action
    // This ensures the agents actually have the capability granted
    const getAgentCapability = (agent: any): string => {
      const caps = JSON.parse(agent.capabilities || "[]");
      return caps.length > 0 ? caps[0] : "execute_task";
    };

    const capabilities = connectedAgents.map((agent) => {
      const agent_db = agents.find((a) => a.did === agent.id);
      return getAgentCapability(agent_db);
    });

    // Create workflow definition with 4 agents in sequence
    // Use minimal params to avoid triggering file system access
    const nodes: any[] = [
      {
        id: "agent1",
        type: "agent",
        data: {
          agentId: connectedAgentIds[0],
          action: capabilities[0],
          params: { test: true, step: 1 },
        },
        position: { x: 100, y: 100 },
      },
      {
        id: "agent2",
        type: "agent",
        data: {
          agentId: connectedAgentIds[1],
          action: capabilities[1],
          params: { test: true, step: 2 },
        },
        position: { x: 300, y: 100 },
      },
      {
        id: "agent3",
        type: "agent",
        data: {
          agentId: connectedAgentIds[2],
          action: capabilities[2],
          params: { test: true, step: 3 },
        },
        position: { x: 500, y: 100 },
      },
      {
        id: "agent4",
        type: "agent",
        data: {
          agentId: connectedAgentIds[3],
          action: capabilities[3],
          params: { test: true, step: 4 },
        },
        position: { x: 700, y: 100 },
      },
    ];

    const edges: any[] = [
      { id: "e1-2", source: "agent1", target: "agent2" },
      { id: "e2-3", source: "agent2", target: "agent3" },
      { id: "e3-4", source: "agent3", target: "agent4" },
    ];

    const definition: WorkflowDefinition = { nodes, edges };

    // Create the workflow
    const workflowId = saveWorkflow(
      "Test E2E Workflow",
      definition,
      undefined,
      defaultRealm.id
    );

    return NextResponse.json({
      success: true,
      workflowId,
      name: "Test E2E Workflow",
      realmId: defaultRealm.id,
      agents: agents.map((a, idx) => ({
        did: a.did,
        name: a.name,
        capability: capabilities[idx],
      })),
      nodes,
    });
  } catch (err) {
    console.error("POST /api/workflows/test-seed error:", err);
    return NextResponse.json({ error: "Failed to create test workflow" }, { status: 500 });
  }
}
