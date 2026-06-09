/**
 * POST /api/server/entra/sync
 * Trigger a user sync from Microsoft Entra ID.
 * Admin-only.
 *
 * Body:
 *   groupIds       string[]              Entra group IDs to import (empty = all users)
 *   groupRealmMap  Record<string,string> Map from group ID → realm ID
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { forbidden, unauthorized } from "@/lib/api/utils/api-utils";
import { syncEntraUsers } from "@/lib/entra-sync";

/**
 * @openapi
 * /api/server/entra/sync:
 *   post:
 *     summary: Trigger a user sync from Microsoft Entra ID.
 *     tags: [Server]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               groupIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Entra group IDs to import (empty = all users)
 *               groupRealmMap:
 *                 type: object
 *                 additionalProperties:
 *                   type: string
 *                 description: Map from group ID to realm ID
 *     responses:
 *       200:
 *         description: Sync operation successful.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties: true
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       502:
 *         description: Sync failed due to server error.
 */
export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const body = (await req.json()) as {
    groupIds?: string[];
    groupRealmMap?: Record<string, string>;
    groupNames?: Record<string, string>;
  };

  const result = await syncEntraUsers({
    groupIds: body.groupIds ?? [],
    groupRealmMap: body.groupRealmMap ?? {},
    groupNames: body.groupNames ?? {},
  });
  return NextResponse.json(result);
}
