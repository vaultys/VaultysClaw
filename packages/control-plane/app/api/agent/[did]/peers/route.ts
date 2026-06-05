import { NextResponse } from "next/server";

/**
 * GET /api/agents/[did]/peers - List agent peers/peer grants
 */
/**
 * @openapi
 * /api/agent/{did}/peers:
 *   get:
 *     summary: List agent peers or peer grants.
 *     tags: [Agents]
 *     parameters:
 *       - name: did
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: The decentralized identifier of the agent.
 *     responses:
 *       200:
 *         description: A list of peers or peer grants.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/PeerGrant'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function GET() {
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}

/**
 * POST /api/agents/[did]/peers - Create peer grant
 */
/**
 * @openapi
 * /api/agent/{did}/peers:
 *   post:
 *     summary: Create a peer grant for an agent.
 *     tags: [Agents]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PeerGrant'
 *     responses:
 *       201:
 *         description: Peer grant created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PeerGrantResponse'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function POST() {
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}
