import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { WorkflowDAO } from "@/db";
import { notFound, unauthorized } from "@/lib/api-utils";

interface Params {
  id: string;
}

/**
 * POST /api/workflow-approvals/[id]/dismiss
 * Dismiss a notification item.
 */
/**
 * @openapi
 * /api/workflow-approvals/{id}/dismiss:
 *   post:
 *     summary: Dismiss a workflow notification.
 *     tags: [Workflow Approvals]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the workflow approval to dismiss.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Notification dismissed successfully.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to dismiss the notification.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<Params> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) {
    return unauthorized();
  }

  const updated = await WorkflowDAO.dismissNotification(id, session.user.did);
  if (!updated) {
    return notFound("Notification not found or not dismissable");
  }

  return NextResponse.json({ success: true });
}
