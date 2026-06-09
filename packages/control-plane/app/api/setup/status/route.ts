import { NextRequest, NextResponse } from "next/server";
import { getSmtpConfig } from "@/lib/smtp";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden } from "@/lib/api-utils";
import { AgentDAO, ModelDAO, RealmDAO } from "@/db";

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
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const allAgents = await AgentDAO.findAll();
  const defaultRealm = await RealmDAO.findDefault();
  const realmUsers = defaultRealm
    ? await RealmDAO.getUsers(defaultRealm.id)
    : [];

  const status: SetupStatus = {
    model: (await ModelDAO.findAll()).length > 0,
    email: getSmtpConfig() !== null,
    users: realmUsers.length > 1, // More than just the admin
    agent: allAgents.length > 0,
  };

  return NextResponse.json({ status });
}
