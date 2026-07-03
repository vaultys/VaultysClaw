import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { ChannelService } from "@/lib/channel-service";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import {
  adminContract,
} from "@/lib/contracts";

/** Channel owner, workspace admin, or (for global channels) global admin. */
async function assertCanAdminChannel(
  auth: Awaited<ReturnType<typeof getAuthContext>>,
  channel: { id: string; workspaceId: string | null }
): Promise<void> {
  const role = await ChannelService.getMemberRole(channel.id, auth.did);
  const isChannelOwner = role === "owner";
  const isWorkspaceAdmin =
    channel.workspaceId && (await auth.canAdminWorkspace(channel.workspaceId));
  const isGlobalAdmin = !channel.workspaceId && auth.isGlobalAdmin;
  if (!isChannelOwner && !isWorkspaceAdmin && !isGlobalAdmin)
    throw new APIException("FORBIDDEN");
}

const handlers = createNextRoute(adminContract.channels, {
  // ── GET /api/channels/:id ─────────────────────────────────────────────────
  getOne: async ({ params, request }) => {
    const auth = await getAuthContext(request);

    const channel = await ChannelService.getChannel(params.id);
    if (!channel) throw new APIException("NOT_FOUND", "Channel not found");

    if (channel.workspaceId && !(await auth.canAccessWorkspace(channel.workspaceId)))
      throw new APIException("FORBIDDEN");

    const members = await ChannelService.getChannelMembers(params.id);
    const stats = await ChannelService.getChannelStats(params.id);

    return {
      status: 200,
      body: {
        channel,
        members: await ChannelService.withMemberNames(members),
        stats,
      },
    };
  },

  // ── PATCH /api/channels/:id ───────────────────────────────────────────────
  update: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);

    const channel = await ChannelService.getChannel(params.id);
    if (!channel) throw new APIException("NOT_FOUND", "Channel not found");
    await assertCanAdminChannel(auth, channel);

    const updated = await ChannelService.updateChannel(params.id, {
      name: body.name?.trim(),
      description: body.description?.trim(),
      topic: body.topic?.trim(),
      isPublic: body.isPublic,
    });

    return { status: 200, body: { channel: updated } };
  },

  // ── DELETE /api/channels/:id ──────────────────────────────────────────────
  archive: async ({ params, request }) => {
    const auth = await getAuthContext(request);

    const channel = await ChannelService.getChannel(params.id);
    if (!channel) throw new APIException("NOT_FOUND", "Channel not found");
    await assertCanAdminChannel(auth, channel);

    await ChannelService.archiveChannel(params.id);
    return { status: 200, body: { success: true } };
  },
});

export const GET = handlers.GET!;
export const PATCH = handlers.PATCH!;
export const DELETE = handlers.DELETE!;
