import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { getWSServer } from "@/lib/ws-server";
import { KnowledgeDAO, SettingsDAO } from "@/db";
import { knowledgeContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(knowledgeContract, {
  // ── POST /api/knowledge/:id/sync ──────────────────────────────────────────
  sync: async ({ params, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const source = await KnowledgeDAO.findSource(params.id);
    if (!source) throw new APIException("NOT_FOUND", "Knowledge source not found");

    if (source.status === "snycing") {
      throw new APIException("CONFLICT", "Sync already in progress");
    }

    const wsServer = getWSServer();
    if (!wsServer) {
      throw new APIException("UNAVAILABLE", "WebSocket server not available");
    }

    // Check if the agent is connected
    if (!wsServer.isAgentOnline(source.agentDid)) {
      throw new APIException(
        "UNAVAILABLE",
        "Agent is offline — cannot trigger sync"
      );
    }

    // Mark as syncing in the control plane DB
    await KnowledgeDAO.updateSourceStatus(params.id, "syncing");

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
    const [
      doclingEnabled,
      doclingUrl,
      doclingSourceEndpoint,
      doclingFileEndpoint,
    ] = await Promise.all([
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

    // For 'files' sources, load file attachments to send to agent
    let fileAttachments:
      | Array<{ id: string; filePath: string | null }>
      | undefined;
    if (source.sourceType === "files") {
      fileAttachments = await KnowledgeDAO.getFilePathsForSource(source.id);
      if (!fileAttachments || fileAttachments.length === 0) {
        throw new APIException(
          "NOT_FOUND",
          "No files attached to this knowledge source"
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

    return {
      status: 200,
      body: {
        success: true,
        messageId,
        status: "syncing",
        docling: !!docling,
      },
    };
  },
});

export const POST = handlers.POST!;
