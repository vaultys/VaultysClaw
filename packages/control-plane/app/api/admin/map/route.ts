import { getAuthContext } from "@/lib/auth-utils";
import { AgentDAO, UserDAO } from "@/db";
import { getWSServer } from "@/lib/ws-server";
import { getDoclingConfig, getStorageConfig } from "@/db/settings.dao";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import {
  adminContract,
  MapMarker,
} from "@/lib/contracts";

/**
 * GET /api/admin/map — aggregate all located entities (agents, users, services)
 * into map markers. Query: `workspace` filters agents/users by workspace id or slug.
 */
const handlers = createNextRoute(adminContract.map, {
  get: async ({ query, request }) => {
    const auth = await getAuthContext(request);

    const workspaceFilter = query.workspace || undefined;
    const markers: MapMarker[] = [];

    // ── Agents ────────────────────────────────────────────────────────────
    const wsServer = getWSServer();
    const onlineDids = new Set(
      wsServer?.getConnectedAgents().map((a) => a.id) ?? []
    );

    const workspaceIds = auth.isGlobalAdmin ? undefined : auth.workspaceIds;

    const { agents } = await AgentDAO.query({
      workspace: workspaceFilter,
      workspaceIds,
      pageSize: 1000,
    });

    for (const agent of agents) {
      if (agent.locationLat == null || agent.locationLon == null) continue;
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

    // ── Users (admins see all; others see co-members of their workspaces) ───────
    if (auth.isGlobalAdmin) {
      const { users } = await UserDAO.list({
        workspaceId: workspaceFilter,
        pageSize: 1000,
      });
      for (const user of users) {
        if (user.locationLat == null || user.locationLon == null) continue;
        markers.push({
          id: user.did ?? user.id,
          type: "user",
          label: user.name ?? user.email ?? user.id,
          lat: user.locationLat,
          lon: user.locationLon,
          meta: { userId: user.id, email: user.email, role: user.role },
        });
      }
    } else if (workspaceIds && workspaceIds.size > 0) {
      const seen = new Set<string>();
      for (const rid of workspaceIds) {
        const { users: workspaceUsers } = await UserDAO.list({
          workspaceId: rid,
          pageSize: 1000,
        });
        for (const user of workspaceUsers) {
          if (seen.has(user.id)) continue;
          seen.add(user.id);
          if (user.locationLat == null || user.locationLon == null) continue;
          markers.push({
            id: user.did ?? user.id,
            type: "user",
            label: user.name ?? user.email ?? user.id,
            lat: user.locationLat,
            lon: user.locationLon,
            meta: { userId: user.id, email: user.email, role: user.role },
          });
        }
      }
    }

    // ── Services (global admin only) ────────────────────────────────────────
    if (auth.isGlobalAdmin && !workspaceFilter) {
      const docling = await getDoclingConfig();
      if (docling?.locationLat != null && docling?.locationLon != null) {
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
      if (storage.locationLat != null && storage.locationLon != null) {
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

    return { status: 200, body: { markers } };
  },
});

export const GET = handlers.GET!;
