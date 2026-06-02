import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { dismissWorkflowNotification } from "@/lib/db";

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
export async function POST(_request: Request, { params }: { params: Promise<Params> }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.did) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const updated = dismissWorkflowNotification(id, session.user.did);
    if (!updated) {
      return NextResponse.json({ error: "Notification not found or not dismissable" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/workflow-approvals/[id]/dismiss error:", err);
    return NextResponse.json({ error: "Failed to dismiss" }, { status: 500 });
  }
}
