import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import {
  getKnowledgeSource,
  updateKnowledgeSourceStatus,
  getDoclingConfig,
  getKnowledgeFileAttachments,
} from "@/lib/db";
import { getWSServer } from "@/lib/ws-server";

// POST /api/knowledge/:id/sync
/**
 * @openapi
 * /api/knowledge/{id}/sync:
 *   post:
 *     summary: Initiate a sync for a knowledge source.
 *     tags: [Knowledge]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the knowledge source to sync.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Sync initiated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 messageId:
 *                   type: string
 *                 status:
 *                   type: string
 *                 docling:
 *                   type: boolean
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: Sync already in progress.
 *       503:
 *         description: Service unavailable or agent offline.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { id } = await params;
  const source = getKnowledgeSource(id);
  if (!source)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (source.status === "syncing") {
    return NextResponse.json(
      { error: "Sync already in progress" },
      { status: 409 }
    );
  }

  const wsServer = getWSServer();
  if (!wsServer) {
    return NextResponse.json(
      { error: "WebSocket server not available" },
      { status: 503 }
    );
  }

  // Check if the agent is connected
  const isOnline = wsServer.isAgentOnline(source.agent_did);
  if (!isOnline) {
    return NextResponse.json(
      { error: "Agent is offline — cannot trigger sync" },
      { status: 503 }
    );
  }

  // Mark as syncing in the control plane DB
  updateKnowledgeSourceStatus(id, "syncing");

  // Dispatch WebSocket message to agent
  const messageId = `ks-sync-${Date.now()}`;
  const config = (() => {
    try {
      return JSON.parse(source.config);
    } catch {
      return {};
    }
  })();

  // Include Docling URL if configured and enabled
  const doclingCfg = getDoclingConfig();
  const docling =
    doclingCfg?.enabled && doclingCfg.url
      ? {
          url: doclingCfg.url,
          sourceEndpoint: doclingCfg.sourceEndpoint,
          fileEndpoint: doclingCfg.fileEndpoint,
        }
      : undefined;

  // For 'files' sources, load file attachments (base64 encoded) to send to agent
  let fileAttachments:
    | Awaited<ReturnType<typeof getKnowledgeFileAttachments>>
    | undefined;
  if (source.source_type === "files") {
    fileAttachments = await getKnowledgeFileAttachments(source.id);
    if (!fileAttachments || fileAttachments.length === 0) {
      return NextResponse.json(
        { error: "No files attached to this source — upload files first" },
        { status: 400 }
      );
    }
  }

  wsServer.sendKnowledgeSync(source.agent_did, messageId, {
    sourceId: source.id,
    sourceName: source.name,
    sourceType: source.source_type,
    config,
    docling,
    fileAttachments,
  });

  return NextResponse.json({
    success: true,
    messageId,
    status: "syncing",
    docling: !!docling,
  });
}
