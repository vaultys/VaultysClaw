import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorized } from "@/lib/auth-utils";
import { AgentDAO, UserDAO } from "@/db";
import { getWSServer } from "@/lib/ws-server";
import { getDoclingConfig, getStorageConfig } from "@/db/settings.dao";

export interface MapMarker {
  id: string;
  type: "agent" | "user" | "docling" | "s3";
  label: string;
  lat: number;
  lon: number;
  online?: boolean;
  meta?: Record<string, unknown>;
}

/**
 * GET /api/map
 * Aggregate all located entities (agents, users, services) into map markers.
 * Query params:
 *   realm – filter agents/users by realm id or slug
 */
export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { searchParams } = new URL(req.url);
  const realmFilter = searchParams.get("realm") || undefined;

  const markers: MapMarker[] = [];

  // ── Agents ──────────────────────────────────────────────────────────────────
  const wsServer = getWSServer();
  const onlineDids = new Set(
    wsServer?.getConnectedAgents().map((a) => a.id) ?? []
  );

  const { agents } = await AgentDAO.query({
    realm: realmFilter,
    pageSize: 1000,
  });

  for (const agent of agents) {
    if (agent.locationLat == null || agent.locationLon == null) continue;
    // Non-admins only see agents in their realms (already filtered by AgentDAO.query)
    markers.push({
      id: agent.did,
      type: "agent",
      label: agent.name,
      lat: agent.locationLat,
      lon: agent.locationLon,
      online: onlineDids.has(agent.did),
      meta: { did: agent.did },
    });
  }

  // ── Users ────────────────────────────────────────────────────────────────────
  if (auth.isGlobalAdmin || !realmFilter) {
    const { users } = await UserDAO.list({
      realmId: realmFilter,
      pageSize: 1000,
    });
    for (const user of users) {
      if (user.locationLat == null || user.locationLon == null) continue;
      markers.push({
        id: user.id,
        type: "user",
        label: user.name ?? user.email ?? user.id,
        lat: user.locationLat,
        lon: user.locationLon,
        meta: { email: user.email, role: user.role },
      });
    }
  }

  // ── Services (global admin only) ─────────────────────────────────────────────
  if (auth.isGlobalAdmin && !realmFilter) {
    const docling = await getDoclingConfig();
    if (
      docling?.locationLat != null &&
      docling?.locationLon != null
    ) {
      markers.push({
        id: "docling",
        type: "docling",
        label: `Docling (${docling.url})`,
        lat: docling.locationLat,
        lon: docling.locationLon,
        online: docling.enabled,
      });
    }

    const storage = await getStorageConfig();
    if (
      storage.locationLat != null &&
      storage.locationLon != null
    ) {
      markers.push({
        id: "s3",
        type: "s3",
        label: storage.s3Bucket
          ? `S3: ${storage.s3Bucket}`
          : "Object Storage",
        lat: storage.locationLat,
        lon: storage.locationLon,
      });
    }
  }

  return NextResponse.json({ markers });
}
