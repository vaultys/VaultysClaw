import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { ChannelService } from "@/lib/channel-service";
import { getRealmById } from "@/lib/db";

/**
 * GET /api/channels?realm=<id>&includeGlobal=true
 * List channels in a realm (optionally including global channels)
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext();
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
    const realm = getRealmById(realmId);
    if (!realm) {
      return NextResponse.json({ error: "Realm not found" }, { status: 404 });
    }

    if (!auth.canAccessRealm(realmId)) {
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
    const globalChannels = includeGlobal ? ChannelService.listGlobalChannels() : [];

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
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthContext();
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
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    const realmId = body.realmId || null;

    // If realm-scoped, verify user can access it
    if (realmId) {
      const realm = getRealmById(realmId);
      if (!realm) {
        return NextResponse.json(
          { error: "Realm not found" },
          { status: 404 }
        );
      }

      if (!auth.canAccessRealm(realmId)) {
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
