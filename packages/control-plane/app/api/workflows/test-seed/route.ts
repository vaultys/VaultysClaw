import { getWSServer } from "@/lib/ws-server";
import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { AgentDAO, WorkspaceDAO, WorkflowDAO } from "@/db";

import { Prisma } from "@prisma/client";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import {
  userContract,
} from "@/lib/contracts";
import { WorkflowDefinition } from "@/lib/workflow-types";

/**
 * POST /api/workflows/test-seed
 * Create a test workflow with 4 real online agents in sequence. Global admin
 * only. Requires 4 agents to be online and registered.
 */
const handlers = createNextRoute(userContract.workflows, {
  testSeed: async ({ request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const wsServer = getWSServer();
    if (!wsServer)
      throw new APIException("UNAVAILABLE", "WebSocket server not available");

    const dbAgents = await AgentDAO.findAll();
    const connectedAgents = wsServer.getConnectedAgents().slice(0, 4);
    if (connectedAgents.length < 4)
      throw new APIException(
        "CONFLICT",
        `Not enough agents connected. Found ${connectedAgents.length}, need 4`
      );

    const connectedAgentIds = connectedAgents.map((a) => a.id);
    const agents = connectedAgentIds
      .map((did) => dbAgents.find((a) => a.did === did))
      .filter((a): a is NonNullable<typeof a> => a != null);

    if (agents.length < 4)
      throw new APIException(
        "CONFLICT",
        `Not enough agents with details found in DB. Found ${agents.length}, need 4`
      );

    const defaultWorkspace = await WorkspaceDAO.findDefault();
    if (!defaultWorkspace)
      throw new APIException("NOT_FOUND", "Default workspace not found");

    // Use each agent's first granted capability, falling back to a generic one.
    const getAgentCapability = (agent: { capabilities?: unknown }): string => {
      const caps = JSON.parse((agent.capabilities as string) || "[]");
      return caps.length > 0 ? caps[0] : "execute_task";
    };
    const capabilities = connectedAgents.map((agent) =>
      getAgentCapability(agents.find((a) => a.did === agent.id) ?? {})
    );

    const nodes = connectedAgentIds.map((did, i) => ({
      id: `agent${i + 1}`,
      type: "agent",
      data: {
        agentId: did,
        action: capabilities[i],
        params: { test: true, step: i + 1 },
      },
      position: { x: 100 + i * 200, y: 100 },
    }));
    const edges = [
      { id: "e1-2", source: "agent1", target: "agent2" },
      { id: "e2-3", source: "agent2", target: "agent3" },
      { id: "e3-4", source: "agent3", target: "agent4" },
    ];

    const definition: WorkflowDefinition = {
      nodes,
      edges,
    } as unknown as WorkflowDefinition;

    const workflow = await WorkflowDAO.create(
      "Test E2E Workflow",
      definition as unknown as Prisma.InputJsonValue,
      undefined,
      defaultWorkspace.id
    );

    return {
      status: 200,
      body: {
        success: true,
        workflowId: workflow.id,
        name: "Test E2E Workflow",
        workspaceId: defaultWorkspace.id,
        agents: agents.map((a, idx) => ({
          did: a.did,
          name: a.name,
          capability: capabilities[idx],
        })),
        nodes,
      },
    };
  },
});

export const POST = handlers.POST!;
