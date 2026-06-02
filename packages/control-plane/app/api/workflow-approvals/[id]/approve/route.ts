import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { resolveWorkflowApproval, dismissWorkflowNotification, getApprovalsForRun } from "@/lib/db";

interface Params {
  id: string;
}

/**
 * POST /api/workflow-approvals/[id]/approve
 * Approve a pending workflow step. Body: { comment?: string }
 */
/**
 * @openapi
 * /api/workflow-approvals/{id}/approve:
 *   post:
 *     summary: Approve a pending workflow step.
 *     tags: [Workflow Approvals]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the workflow approval.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               comment:
 *                 type: string
 *                 description: Optional comment for the approval.
 *     responses:
 *       200:
 *         description: Workflow step approved successfully.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to approve the workflow step.
 */
export async function POST(request: Request, { params }: { params: Promise<Params> }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.did) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({})) as { comment?: string };

    const updated = resolveWorkflowApproval(id, session.user.did, "approved", body.comment);
    if (!updated) {
      return NextResponse.json({ error: "Approval not found or already decided" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/workflow-approvals/[id]/approve error:", err);
    return NextResponse.json({ error: "Failed to approve" }, { status: 500 });
  }
}
