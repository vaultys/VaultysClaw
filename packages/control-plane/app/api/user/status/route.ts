import { NextResponse } from "next/server";
import { VaultysId } from "@vaultys/id";
import { SettingsDAO, UserDAO } from "@/db";

/**
 * @openapi
 * /api/user/status:
 *   get:
 *     summary: Retrieve the user status and server DID.
 *     tags: [User]
 *     responses:
 *       200:
 *         description: Successful response with user status and server DID.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 hasUsers:
 *                   type: boolean
 *                   description: Indicates if there are any users.
 *                 serverDid:
 *                   type: string
 *                   nullable: true
 *                   description: The server DID if available.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function GET() {
  const hasUsers = await UserDAO.hasAnyUser();
  const serverSecret = await SettingsDAO.get("serverSecret");
  let serverDid: string | null = null;
  if (serverSecret) {
    serverDid = VaultysId.fromSecret(serverSecret, "base64").did;
  }
  return NextResponse.json({ hasUsers, serverDid });
}
