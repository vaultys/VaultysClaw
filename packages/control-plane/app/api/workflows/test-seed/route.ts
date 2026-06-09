import { NextRequest, NextResponse } from "next/server";
import { getWSServer } from "@/lib/ws-server";
import { getAuthContext } from "@/lib/auth-utils";
import {
  unauthorized,
  forbidden,
  unavailable,
  conflict,
  notFound,
} from "@/lib/api-utils";
import { AgentDAO, RealmDAO, WorkflowDAO } from "@/db";
import type { WorkflowDefinition } from "@/lib/workflow-executor";
import { Prisma } from "@prisma/client";

/**
 * POST /api/workflows/test-seed
 * Create a test workflow with 4 real agents in sequence. Global admin only.
 * Requires 4 agents to be online and registered
 */
/**
 * @openapi
 * /api/workflows/test-seed:
 *   post:
 *     summary: Create a test workflow with 4 real agents in sequence.
 *     tags: [Workflows]
 *     responses:
 *       200:
 *         description: Successfully created a test workflow.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 workflowId:
 *                   type: string
 *                 name:
 *                   type: string
 *                 realmId:
 *                   type: string
 *                 agents:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       did:
 *                         type: string
 *                       name:
 *                         type: string
 *                       capability:
 *                         type: string
 *                 nodes:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       type:
 *                         type: string
 *                       data:
 *                         type: object
 *                         properties:
 *                           agentId:
 *                             type: string
 *                           action:
 *                             type: string
 *                           params:
 *                             type: object
 *                             properties:
 *                               test:
 *                                 type: boolean
 *                               step:
 *                                 type: integer
 *                       position:
 *                         type: object
 *                         properties:
 *                           x:
 *                             type: integer
 *                           y:
 *                             type: integer
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         description: Internal server error.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const wsServer = getWSServer();
  if (!wsServer) {
    return unavailable("WebSocket server not available");
  }

  // Get connected agents
  const dbAgents = await AgentDAO.findAll();
  const connectedAgents = wsServer.getConnectedAgents().slice(0, 4);

  if (connectedAgents.length < 4) {
    return conflict(
      `Not enough agents connected. Found ${connectedAgents.length}, need 4`
    );
  }

  const connectedAgentIds = connectedAgents.map((a) => a.id);
  const agents = connectedAgentIds
    .map((did) => dbAgents.find((a) => a.did === did))
    .filter((a): a is NonNullable<typeof a> => a != null);

  if (agents.length < 4) {
    return conflict(
      `Not enough agents with details found in DB. Found ${agents.length}, need 4`
    );
  }

  // Get default realm
  const defaultRealm = await RealmDAO.findDefault();
  if (!defaultRealm) {
    return notFound("Default realm not found");
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
  const workflowId = await WorkflowDAO.create(
    "Test E2E Workflow",
    definition as unknown as Prisma.InputJsonValue,
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
}
