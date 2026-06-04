import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { WorkflowDAO } from "@/db";

/**
 * GET /api/workflow-runs
 * List workflow runs with optional pagination and filters.
 *
 * Query params:
 *   workflowId – filter by workflow ID
 *   status     – filter by status (running|completed|failed)
 *   page       – page number (default 1)
 *   pageSize   – items per page (default 20, max 100)
 *   sortBy     – startedAt | completedAt (default startedAt)
 *   sortDir    – asc | desc (default desc)
 */
/**
 * @openapi
 * /api/workflow-runs:
 *   get:
 *     summary: List workflow runs with optional pagination and filters.
 *     tags: [Workflows]
 *     parameters:
 *       - in: query
 *         name: workflowId
 *         schema:
 *           type: string
 *         description: Filter by workflow ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [running, completed, failed]
 *         description: Filter by status
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: Items per page
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [startedAt, completedAt]
 *           default: startedAt
 *         description: Sort by field
 *       - in: query
 *         name: sortDir
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort direction
 *     responses:
 *       200:
 *         description: A list of workflow runs.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 runs:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 pageSize:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         description: Failed to fetch workflow runs.
 */
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.did) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workflowId = searchParams.get("workflowId") ?? undefined;
    const status = searchParams.get("status") ?? undefined;
    const page = Math.max(
      1,
      parseInt(searchParams.get("page") ?? "1", 10) || 1
    );
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10) || 20)
    );
    const sortBy = (searchParams.get("sortBy") ?? "startedAt") as
      | "startedAt"
      | "completedAt";
    const sortDir = (searchParams.get("sortDir") ?? "desc") as "asc" | "desc";

    const result = await WorkflowDAO.queryRuns({
      workflowId,
      status,
      page,
      pageSize,
      sortBy,
      sortDir,
    });

    return NextResponse.json({
      runs: result.runs,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
    });
  } catch (error) {
    console.error("Failed to fetch workflow runs:", error);
    return NextResponse.json(
      { error: "Failed to fetch workflow runs" },
      { status: 500 }
    );
  }
}
