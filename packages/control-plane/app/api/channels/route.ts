import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { ChannelService } from "@/lib/channel-service";
import { RealmDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { channelsContract } from "@/lib/contracts";

const handlers = createNextRoute(channelsContract, {
  // ── GET /api/channels?realm=<id>&includeGlobal=true ───────────────────────
  list: async ({ query, request }) => {
    const auth = await getAuthContext(request);

    const realm = await RealmDAO.findById(query.realm);
    if (!realm) throw new APIException("NOT_FOUND", "Realm not found");
    if (!(await auth.canAccessRealm(query.realm)))
      throw new APIException("FORBIDDEN");

    const realmChannels = (
      await ChannelService.listChannels(query.realm)
    ).filter((c) => c.realmId === query.realm);
    const globalChannels = query.includeGlobal
      ? await ChannelService.listGlobalChannels()
      : [];

    return {
      status: 200,
      body: { channels: [...realmChannels, ...globalChannels] },
    };
  },

  // ── POST /api/channels ────────────────────────────────────────────────────
  create: async ({ body, request }) => {
    const auth = await getAuthContext(request);

    if (!body.name?.trim()) throw new APIException("MALFORMED", "name is required");

    const realmId = body.realmId || null;
    if (realmId) {
      const realm = await RealmDAO.findById(realmId);
      if (!realm) throw new APIException("NOT_FOUND", "Realm not found");
      if (!(await auth.canAccessRealm(realmId)))
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
      realmId: realmId || undefined,
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
