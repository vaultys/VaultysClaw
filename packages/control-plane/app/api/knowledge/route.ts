import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, unauthorized, forbidden } from '@/lib/auth-utils';
import {
  createKnowledgeSource,
  listKnowledgeSources,
  getRealmById,
  getAgent,
} from '@/lib/db';

// GET /api/knowledge?realmId=xxx&agentDid=xxx
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();

  const realmId = request.nextUrl.searchParams.get('realmId') ?? undefined;
  const agentDid = request.nextUrl.searchParams.get('agentDid') ?? undefined;

  // Non-admins can only list knowledge sources for realms they can access
  if (!auth.isGlobalAdmin && realmId && !auth.canAccessRealm(realmId)) {
    return forbidden();
  }

  const sources = listKnowledgeSources({ realmId, agentDid });
  return NextResponse.json({ sources });
}

// POST /api/knowledge
// Body: { realmId, agentDid, name, sourceType, config }
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
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
    return NextResponse.json({ error: 'Missing required fields: realmId, agentDid, name, sourceType' }, { status: 400 });
  }

  const realm = getRealmById(realmId);
  if (!realm) return NextResponse.json({ error: 'Realm not found' }, { status: 404 });

  const agent = getAgent(agentDid);
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  const source = createKnowledgeSource({
    realm_id: realmId,
    agent_did: agentDid,
    name,
    source_type: sourceType,
    config: JSON.stringify(config ?? {}),
    status: 'idle',
    doc_count: 0,
    chunk_count: 0,
    last_synced_at: null,
    error: null,
  });

  return NextResponse.json({ source }, { status: 201 });
}
