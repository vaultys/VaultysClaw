/**
 * GET  /api/users/[did]/grants  — list grants for a user
 * POST /api/users/[did]/grants  — create a grant + sign delegation cert + push to agent
 * Owner-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { UserDao } from "@/lib/user-dao";
import { GrantDao } from "@/lib/grant-dao";
import { DelegationDao } from "@/lib/delegation-dao";
import { signDelegation } from "@/lib/delegation";
import { getWSServer } from "@/lib/ws-server";
import type { AgentCapability } from "@vaultysclaw/shared";

/**
 * @openapi
 * /api/users/{did}/grants:
 *   get:
 *     summary: List grants for a user.
 *     tags: [Users]
 *     parameters:
 *       - name: did
 *         in: path
 *         required: true
 *         description: The DID of the user.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: A list of grants for the user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 grants:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       agentDid:
 *                         type: string
 *                       capabilities:
 *                         type: array
 *                         items:
 *                           type: string
 *                       grantedBy:
 *                         type: string
 *                       expiresAt:
 *                         type: string
 *                         format: date-time
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ did: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { did } = await params;
  const user = UserDao.getByDid(did);
  if (!user)
    return NextResponse.json({ error: "User not found" }, { status: 404 });

  const grants = GrantDao.listByUser(did).map((g) => ({
    id: g.id,
    agentDid: g.agent_did,
    capabilities: JSON.parse(g.capabilities) as string[],
    grantedBy: g.granted_by,
    expiresAt: g.expires_at,
    createdAt: g.created_at,
  }));

  return NextResponse.json({ grants });
}

/**
 * @openapi
 * /api/users/{did}/grants:
 *   post:
 *     summary: Create a grant and sign delegation certificate for a user.
 *     tags: [Users]
 *     parameters:
 *       - name: did
 *         in: path
 *         required: true
 *         description: The DID of the user.
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               agentDid:
 *                 type: string
 *                 nullable: true
 *                 description: The DID of the agent or null for all agents.
 *               capabilities:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/AgentCapability'
 *                 description: List of capabilities to grant.
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *                 description: Expiration date of the grant.
 *     responses:
 *       201:
 *         description: Grant created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 grant:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     agentDid:
 *                       type: string
 *                     capabilities:
 *                       type: array
 *                       items:
 *                         type: string
 *                     grantedBy:
 *                       type: string
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ did: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { did } = await params;
  const user = UserDao.getByDid(did);
  if (!user)
    return NextResponse.json({ error: "User not found" }, { status: 404 });

  const body = (await req.json()) as {
    agentDid?: string | null;
    capabilities: AgentCapability[];
    expiresAt?: string;
  };

  if (!Array.isArray(body.capabilities) || body.capabilities.length === 0) {
    return NextResponse.json(
      { error: "capabilities must be a non-empty array" },
      { status: 400 }
    );
  }

  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : undefined;
  const agentDid = body.agentDid ?? null; // null = all agents

  // Create the grant row
  const grant = GrantDao.create({
    user_did: did,
    agent_did: agentDid,
    capabilities: JSON.stringify(body.capabilities),
    granted_by: session.user.did ?? "",
    expires_at: expiresAt ? expiresAt.toISOString() : null,
  });

  // Sign a delegation certificate for each target agent (or wildcard)
  const effectiveAgentDid = agentDid ?? "*";
  const certificate = await signDelegation(
    did,
    effectiveAgentDid,
    body.capabilities,
    expiresAt
  );

  DelegationDao.create({
    grant_id: grant.id,
    user_did: did,
    agent_did: effectiveAgentDid,
    capabilities: JSON.stringify(body.capabilities),
    certificate,
    expires_at: expiresAt ? expiresAt.toISOString() : null,
  });

  // Push delegation_update to the affected agent(s)
  const wsServer = getWSServer();
  if (wsServer) {
    if (agentDid) {
      wsServer.pushDelegationUpdate(agentDid);
    } else {
      // Wildcard grant — push to all connected agents
      wsServer.pushDelegationUpdateAll();
    }
  }

  return NextResponse.json(
    {
      grant: {
        id: grant.id,
        agentDid: grant.agent_did,
        capabilities: JSON.parse(grant.capabilities) as string[],
        grantedBy: grant.granted_by,
        expiresAt: grant.expires_at,
        createdAt: grant.created_at,
      },
    },
    { status: 201 }
  );
}
