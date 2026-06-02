import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import {
  createKnowledgeSource,
  listKnowledgeSources,
  getRealmById,
  getAgent,
} from "@/lib/db";

// GET /api/knowledge?realmId=xxx&agentDid=xxx
/**
 * @openapi
 * /api/knowledge:
 *   get:
 *     summary: List knowledge sources.
 *     tags: [Knowledge]
 *     parameters:
 *       - in: query
 *         name: realmId
 *         schema:
 *           type: string
 *         required: false
 *         description: The ID of the realm to filter knowledge sources.
 *       - in: query
 *         name: agentDid
 *         schema:
 *           type: string
 *         required: false
 *         description: The DID of the agent to filter knowledge sources.
 *     responses:
 *       200:
 *         description: A list of knowledge sources.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sources:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();

  const realmId = request.nextUrl.searchParams.get("realmId") ?? undefined;
  const agentDid = request.nextUrl.searchParams.get("agentDid") ?? undefined;

  // Non-admins can only list knowledge sources for realms they can access
  if (!auth.isGlobalAdmin && realmId && !auth.canAccessRealm(realmId)) {
    return forbidden();
  }

  const sources = listKnowledgeSources({ realmId, agentDid });
  return NextResponse.json({ sources });
}

// POST /api/knowledge
// Body: { realmId, agentDid, name, sourceType, config }
/**
 * @openapi
 * /api/knowledge:
 *   post:
 *     summary: Create a new knowledge source.
 *     tags: [Knowledge]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               realmId:
 *                 type: string
 *               agentDid:
 *                 type: string
 *               name:
 *                 type: string
 *               sourceType:
 *                 type: string
 *               config:
 *                 type: object
 *     responses:
 *       201:
 *         description: Knowledge source created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 source:
 *                   type: object
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const body = await request.json();
  const { realmId, agentDid, name, sourceType, config } = body as {
    realmId: string;
    agentDid: string;
    name: string;
    sourceType: string;
    config: Record<string, unknown>;
  };

  if (!realmId || !agentDid || !name || !sourceType) {
    return NextResponse.json(
      { error: "Missing required fields: realmId, agentDid, name, sourceType" },
      { status: 400 }
    );
  }

  const realm = getRealmById(realmId);
  if (!realm)
    return NextResponse.json({ error: "Realm not found" }, { status: 404 });

  const agent = getAgent(agentDid);
  if (!agent)
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const source = createKnowledgeSource({
    realm_id: realmId,
    agent_did: agentDid,
    name,
    source_type: sourceType,
    config: JSON.stringify(config ?? {}),
    status: "idle",
    doc_count: 0,
    chunk_count: 0,
    last_synced_at: null,
    error: null,
  });

  return NextResponse.json({ source }, { status: 201 });
}
