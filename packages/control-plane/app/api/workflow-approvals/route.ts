import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { WorkflowDAO } from "@/db";

/**
 * GET /api/workflow-approvals[?all=1]
 * Returns approval/notification items for the logged-in user.
 * Without ?all=1, only pending/notified are returned.
 */
/**
 * @openapi
 * /api/workflow-approvals:
 *   get:
 *     summary: Retrieve approval items for the logged-in user.
 *     tags: [Workflows]
 *     parameters:
 *       - in: query
 *         name: all
 *         schema:
 *           type: string
 *         description: Include all approvals if set to 1, otherwise only pending.
 *     responses:
 *       200:
 *         description: A list of approval items.
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
 *       500:
 *         description: Failed to fetch approvals.
 */
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.did) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const all = searchParams.get("all") === "1";
    const approvals = all
      ? await WorkflowDAO.getAllApprovalsForUser(session.user.did)
      : await WorkflowDAO.getPendingApprovalsForUser(session.user.did);

    return NextResponse.json({ approvals });
  } catch (err) {
    console.error("GET /api/workflow-approvals error:", err);
    return NextResponse.json(
      { error: "Failed to fetch approvals" },
      { status: 500 }
    );
  }
}
