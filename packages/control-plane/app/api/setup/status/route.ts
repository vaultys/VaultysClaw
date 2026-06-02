import { NextRequest, NextResponse } from "next/server";
import {
  getAllModelRegistryEntries,
  getAllAgents,
  getRealmUsers,
  getDefaultRealm,
} from "@/lib/db";
import { getSmtpConfig } from "@/lib/smtp";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";

interface SetupStatus {
  model: boolean;
  email: boolean;
  users: boolean;
  agent: boolean;
}

/** GET /api/setup/status — check which setup steps are completed */
/**
 * @openapi
 * /api/setup/status:
 *   get:
 *     summary: Check which setup steps are completed.
 *     tags: [Setup]
 *     responses:
 *       200:
 *         description: A list of completed setup steps.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: object
 *                   properties:
 *                     model:
 *                       type: boolean
 *                     email:
 *                       type: boolean
 *                     users:
 *                       type: boolean
 *                     agent:
 *                       type: boolean
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         description: Failed to fetch setup status.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) return unauthorized();
    if (!auth.isGlobalAdmin) return forbidden();

    const allAgents = getAllAgents();
    const defaultRealm = getDefaultRealm();
    const realmUsers = defaultRealm ? getRealmUsers(defaultRealm.id) : [];

    const status: SetupStatus = {
      model: getAllModelRegistryEntries().length > 0,
      email: getSmtpConfig() !== null,
      users: realmUsers.length > 1, // More than just the admin
      agent: allAgents.length > 0,
    };

    return NextResponse.json({ status });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch setup status" }, { status: 500 });
  }
}
