import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, unauthorized, forbidden } from '@/lib/auth-utils';
import { getKnowledgeSource, updateKnowledgeSourceStatus } from '@/lib/db';
import { getWSServer } from '@/lib/ws-server';

// POST /api/knowledge/:id/sync
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { id } = await params;
  const source = getKnowledgeSource(id);
  if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (source.status === 'syncing') {
    return NextResponse.json({ error: 'Sync already in progress' }, { status: 409 });
  }

  const wsServer = getWSServer();
  if (!wsServer) {
    return NextResponse.json({ error: 'WebSocket server not available' }, { status: 503 });
  }

  // Check if the agent is connected
  const isOnline = wsServer.isAgentOnline(source.agent_did);
  if (!isOnline) {
    return NextResponse.json({ error: 'Agent is offline — cannot trigger sync' }, { status: 503 });
  }

  // Mark as syncing in the control plane DB
  updateKnowledgeSourceStatus(id, 'syncing');

  // Dispatch WebSocket message to agent
  const messageId = `ks-sync-${Date.now()}`;
  const config = (() => { try { return JSON.parse(source.config); } catch { return {}; } })();

  wsServer.sendKnowledgeSync(source.agent_did, messageId, {
    sourceId: source.id,
    sourceName: source.name,
    sourceType: source.source_type,
    config,
  });

  return NextResponse.json({ success: true, messageId, status: 'syncing' });
}
