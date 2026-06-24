import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { ChannelService } from "@/lib/channel-service";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { channelsContract } from "@/lib/contracts";

/** Channel owner, realm admin, or (for global channels) global admin. */
async function assertCanAdminChannel(
  auth: Awaited<ReturnType<typeof getAuthContext>>,
  channel: { id: string; realmId: string | null }
): Promise<void> {
  const role = await ChannelService.getMemberRole(channel.id, auth.did);
  const isChannelOwner = role === "owner";
  const isRealmAdmin =
    channel.realmId && (await auth.canAdminRealm(channel.realmId));
  const isGlobalAdmin = !channel.realmId && auth.isGlobalAdmin;
  if (!isChannelOwner && !isRealmAdmin && !isGlobalAdmin)
    throw new APIException("FORBIDDEN");
}

const handlers = createNextRoute(channelsContract, {
  // ── GET /api/channels/:id ─────────────────────────────────────────────────
  getOne: async ({ params, request }) => {
    const auth = await getAuthContext(request);

    const channel = await ChannelService.getChannel(params.id);
    if (!channel) throw new APIException("NOT_FOUND", "Channel not found");

    if (channel.realmId && !(await auth.canAccessRealm(channel.realmId)))
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
