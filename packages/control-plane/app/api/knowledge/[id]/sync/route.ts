import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { getWSServer } from "@/lib/ws-server";
import { KnowledgeDAO, SettingsDAO } from "@/db";

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
  const source = await KnowledgeDAO.findSource(id);
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
  const isOnline = wsServer.isAgentOnline(source.agentDid);
  if (!isOnline) {
    return NextResponse.json(
      { error: "Agent is offline — cannot trigger sync" },
      { status: 503 }
    );
  }

  // Mark as syncing in the control plane DB
  await KnowledgeDAO.updateSourceStatus(id, "syncing");

  // Dispatch WebSocket message to agent
  const messageId = `ks-sync-${Date.now()}`;
  const config = (() => {
    try {
      return source.config;
    } catch {
      return {};
    }
  })();

  // Include Docling URL if configured and enabled
  const [doclingEnabled, doclingUrl, doclingSourceEndpoint, doclingFileEndpoint] =
    await Promise.all([
      SettingsDAO.get("docling_enabled"),
      SettingsDAO.get("docling_url"),
      SettingsDAO.get("docling_source_endpoint"),
      SettingsDAO.get("docling_file_endpoint"),
    ]);
  const docling =
    doclingEnabled === "true" && doclingUrl
      ? {
          url: doclingUrl,
          sourceEndpoint: doclingSourceEndpoint,
          fileEndpoint: doclingFileEndpoint,
        }
      : undefined;

  // For 'files' sources, load file attachments (base64 encoded) to send to agent
  let fileAttachments: Array<{ id: string; filePath: string | null }> | undefined;
  if (source.sourceType === "files") {
    fileAttachments = await KnowledgeDAO.getFilePathsForSource(source.id);
    if (!fileAttachments || fileAttachments.length === 0) {
      return NextResponse.json(
        { error: "No files attached to this source — upload files first" },
        { status: 400 }
      );
    }
  }

  wsServer.sendKnowledgeSync(source.agentDid, messageId, {
    sourceId: source.id,
    sourceName: source.name,
    sourceType: source.sourceType,
    config: config as Record<string, unknown>,
    docling,
    fileAttachments: fileAttachments as any,
  });

  return NextResponse.json({
    success: true,
    messageId,
    status: "syncing",
    docling: !!docling,
  });
}
