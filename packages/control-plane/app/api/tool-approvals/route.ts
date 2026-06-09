/**
 * GET  /api/tool-approvals          — List pending tool approval requests
 * POST /api/tool-approvals          — Respond to a tool approval request
 */

import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { getWSServer } from "@/lib/ws-server";
import { withError } from "@/lib/api/handlers/with-error";
import {
  malformed,
  unauthorized,
  unavailable,
} from "@/lib/api/utils/api-utils";

/**
 * @openapi
 * /api/tool-approvals:
 *   get:
 *     summary: List pending tool approval requests.
 *     tags: [Tool Approvals]
 *     responses:
 *       200:
 *         description: A list of pending tool approval requests.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 approvals:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       503:
 *         description: WebSocket server not available.
 */
export const GET = withError(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return unauthorized();
  }

  const wsServer = getWSServer();
  if (!wsServer) {
    return unavailable("WebSocket server not available");
  }

  const approvals = wsServer.getPendingToolApprovals();
  return NextResponse.json({ approvals });
});

/**
 * @openapi
 * /api/tool-approvals:
 *   post:
 *     summary: Respond to a tool approval request.
 *     tags: [Tool Approvals]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               requestId:
 *                 type: string
 *                 description: The ID of the approval request.
 *               approved:
 *                 type: boolean
 *                 description: Approval status.
 *               reason:
 *                 type: string
 *                 description: Optional reason for approval or rejection.
 *             required:
 *               - requestId
 *               - approved
 *     responses:
 *       200:
 *         description: Approval response processed successfully.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       503:
 *         description: WebSocket server not available.
 */
export const POST = withError(async (request: NextRequest) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return unauthorized();
  }

  const wsServer = getWSServer();
  if (!wsServer) {
    return unavailable("WebSocket server not available");
  }

  const body = await request.json();
  const { requestId, approved, reason } = body as {
    requestId?: string;
    approved?: boolean;
    reason?: string;
  };

  if (!requestId || typeof approved !== "boolean") {
    return malformed("requestId (string) and approved (boolean) are required");
  }

  const ok = wsServer.respondToToolApproval(requestId, approved, reason);
  if (!ok) {
    return unavailable("Failed to process approval response");
  }

  return NextResponse.json({ success: true, requestId, approved });
});
