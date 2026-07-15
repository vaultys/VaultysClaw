import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { ChannelService } from "@/lib/channel-service";
import { WorkspaceDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import {
  userContract,
} from "@/lib/contracts";

const handlers = createNextRoute(userContract.channels, {
  // ── GET /api/channels?workspace=<id>&includeGlobal=true ───────────────────────
  list: async ({ query, request }) => {
    const auth = await getAuthContext(request);

    const workspace = await WorkspaceDAO.findById(query.workspace);
    if (!workspace) throw new APIException("NOT_FOUND", "Workspace not found");
    if (!(await auth.canAccessWorkspace(query.workspace)))
      throw new APIException("FORBIDDEN");

    const workspaceChannels = (
      await ChannelService.listChannels(query.workspace)
    ).filter((c) => c.workspaceId === query.workspace);
    const globalChannels = query.includeGlobal
      ? await ChannelService.listGlobalChannels()
      : [];

    return {
      status: 200,
      body: { channels: [...workspaceChannels, ...globalChannels] },
    };
  },

  // ── POST /api/channels ────────────────────────────────────────────────────
  create: async ({ body, request }) => {
    const auth = await getAuthContext(request);

    if (!body.name?.trim()) throw new APIException("MALFORMED", "name is required");

    const workspaceId = body.workspaceId || null;
    if (workspaceId) {
      const workspace = await WorkspaceDAO.findById(workspaceId);
      if (!workspace) throw new APIException("NOT_FOUND", "Workspace not found");
      if (!(await auth.canAccessWorkspace(workspaceId)))
        throw new APIException("FORBIDDEN");
    } else if (!auth.isGlobalAdmin) {
      throw new APIException("FORBIDDEN");
    }

    const slug =
      (body.slug || body.name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || null;
    if (!slug)
      throw new APIException("MALFORMED", "Could not generate valid slug from name");

    const channel = await ChannelService.createChannel({
      name: body.name.trim(),
      slug,
      workspaceId: workspaceId || undefined,
      description: body.description?.trim(),
      isPublic: body.isPublic ?? true,
      topic: body.topic?.trim(),
      creatorDid: auth.did,
    });

    return { status: 201, body: { channel } };
  },
});

export const GET = handlers.GET!;
export const POST = handlers.POST!;
