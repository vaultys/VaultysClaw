import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
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
  try {
    const auth = await getAuthContext(req);
    if (!auth) return unauthorized();

    const url = new URL(req.url);
    const realmId = url.searchParams.get("realm");
    const includeGlobal = url.searchParams.get("includeGlobal") === "true";

    if (!realmId) {
      return NextResponse.json(
        { error: "realm query parameter is required" },
        { status: 400 }
      );
    }

    // Verify realm exists and user can access it
    const realm = await RealmDAO.findById(realmId);
    if (!realm) {
      return NextResponse.json({ error: "Realm not found" }, { status: 404 });
    }

    if (!(await auth.canAccessRealm(realmId))) {
      return forbidden();
    }

    // Get channels
    const channels = includeGlobal
      ? ChannelService.listChannels(realmId)
      : ChannelService.getChannel(realmId);

    // Return realm channels and optionally global channels
    const realmChannels = ChannelService.listChannels(realmId).filter(
      (c) => c.realmId === realmId
    );
    const globalChannels = includeGlobal
      ? ChannelService.listGlobalChannels()
      : [];

    return NextResponse.json({
      channels: [...realmChannels, ...globalChannels],
    });
  } catch (err) {
    console.error("GET /api/channels error:", err);
    return NextResponse.json(
      { error: "Failed to fetch channels" },
      { status: 500 }
    );
  }
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
  try {
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
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const realmId = body.realmId || null;

    // If realm-scoped, verify user can access it
    if (realmId) {
      const realm = await RealmDAO.findById(realmId);
      if (!realm) {
        return NextResponse.json({ error: "Realm not found" }, { status: 404 });
      }

      if (!(await auth.canAccessRealm(realmId))) {
        return forbidden();
      }
    } else {
      // Global channels require global admin
      if (!auth.isGlobalAdmin) {
        return forbidden();
      }
    }

    // Generate slug if not provided
    const slug =
      (body.slug || body.name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || null;

    if (!slug) {
      return NextResponse.json(
        { error: "Could not generate valid slug from name" },
        { status: 400 }
      );
    }

    // Create channel
    const channel = ChannelService.createChannel({
      name: body.name.trim(),
      slug,
      realmId: realmId || undefined,
      description: body.description?.trim(),
      isPublic: body.isPublic ?? true,
      topic: body.topic?.trim(),
      creatorDid: auth.did,
    });

    return NextResponse.json({ channel }, { status: 201 });
  } catch (err: any) {
    console.error("POST /api/channels error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to create channel" },
      { status: 500 }
    );
  }
}
