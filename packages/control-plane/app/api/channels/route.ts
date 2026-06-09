import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import {
  unauthorized,
  forbidden,
  notFound,
  malformed,
} from "@/lib/api/utils/api-utils";
import { ChannelService } from "@/lib/channel-service";
import { RealmDAO } from "@/db";

/**
 * GET /api/channels?realm=<id>&includeGlobal=true
 * List channels in a realm (optionally including global channels)
 */
/**
 * @openapi
 * /api/channels:
 *   get:
 *     summary: List channels in a realm, optionally including global channels.
 *     tags: [Channels]
 *     parameters:
 *       - name: realm
 *         in: query
 *         required: true
 *         description: The ID of the realm to list channels for.
 *         schema:
 *           type: string
 *       - name: includeGlobal
 *         in: query
 *         required: false
 *         description: Whether to include global channels.
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: A list of channels.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 channels:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Channel'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to fetch channels.
 */
export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const url = new URL(req.url);
  const realmId = url.searchParams.get("realm");
  const includeGlobal = url.searchParams.get("includeGlobal") === "true";

  if (!realmId) {
    return malformed("realm query parameter is required");
  }

  // Verify realm exists and user can access it
  const realm = await RealmDAO.findById(realmId);
  if (!realm) {
    return notFound("Realm not found");
  }

  if (!(await auth.canAccessRealm(realmId))) {
    return forbidden();
  }

  // Return realm channels and optionally global channels
  const realmChannels = (await ChannelService.listChannels(realmId)).filter(
    (c) => c.realmId === realmId
  );
  const globalChannels = includeGlobal
    ? await ChannelService.listGlobalChannels()
    : [];

  return NextResponse.json({
    channels: [...realmChannels, ...globalChannels],
  });
}

/**
 * POST /api/channels
 * Create a new channel
 * Body: { name, slug?, realmId?, description?, isPublic?, topic? }
 */
/**
 * @openapi
 * /api/channels:
 *   post:
 *     summary: Create a new channel
 *     tags: [Channels]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: The name of the channel.
 *               slug:
 *                 type: string
 *                 description: Optional slug for the channel.
 *               realmId:
 *                 type: string
 *                 description: Optional realm ID for the channel.
 *               description:
 *                 type: string
 *                 description: Optional description of the channel.
 *               isPublic:
 *                 type: boolean
 *                 description: Whether the channel is public.
 *               topic:
 *                 type: string
 *                 description: Optional topic of the channel.
 *             required:
 *               - name
 *     responses:
 *       201:
 *         description: Channel created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 channel:
 *                   $ref: '#/components/schemas/Channel'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         description: Internal server error.
 */
export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const body = (await req.json()) as {
    name?: string;
    slug?: string;
    realmId?: string;
    description?: string;
    isPublic?: boolean;
    topic?: string;
  };

  if (!body.name?.trim()) {
    return malformed("name is required");
  }

  const realmId = body.realmId || null;

  // If realm-scoped, verify user can access it
  if (realmId) {
    const realm = await RealmDAO.findById(realmId);
    if (!realm) {
      return notFound("Realm not found");
    }

    if (!(await auth.canAccessRealm(realmId))) {
      return forbidden();
    }
  } else if (!auth.isGlobalAdmin) {
    return forbidden();
  }

  // Generate slug if not provided
  const slug =
    (body.slug || body.name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || null;

  if (!slug) {
    return malformed("Could not generate valid slug from name");
  }

  // Create channel
  const channel = await ChannelService.createChannel({
    name: body.name.trim(),
    slug,
    realmId: realmId || undefined,
    description: body.description?.trim(),
    isPublic: body.isPublic ?? true,
    topic: body.topic?.trim(),
    creatorDid: auth.did,
  });

  return NextResponse.json({ channel }, { status: 201 });
}
