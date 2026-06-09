import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { WorkflowDAO } from "@/db";
import { notFound, unauthorized } from "@/lib/api/utils/api-utils";

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
export async function POST(
  request: Request,
  { params }: { params: Promise<Params> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) {
    return unauthorized();
  }

  const body = (await request.json().catch(() => ({}))) as {
    comment?: string;
  };

  const updated = await WorkflowDAO.resolveApproval(
    id,
    session.user.did,
    "approved",
    body.comment
  );
  if (!updated) {
    return notFound("Approval not found or already decided");
  }

  return NextResponse.json({ success: true });
}
