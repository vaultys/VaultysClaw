import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import {
  unauthorized,
  forbidden,
  notFound,
  malformed,
} from "@/lib/api/utils/api-utils";
import { sendSkillsConfig } from "@/lib/ws-server";
import { AgentDAO, RealmSkillDAO, SkillOverrideDAO } from "@/db";
import { withError } from "@/lib/api/handlers/with-error";

type Ctx = { params: Promise<{ did: string; skillId: string }> };

/**
 * @openapi
 * //api/agents/{did}/skill/{skillId}:
 *   patch:
 *     summary: Update an agent's skill override.
 *     tags: [Agents]
 *     parameters:
 *       - name: did
 *         in: path
 *         required: true
 *         description: The DID of the agent.
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enabled:
 *                 type: boolean
 *                 description: Whether the skill is enabled.
 *             required:
 *               - enabled
 *     responses:
 *       200:
 *         description: Successfully updated the agent's skill override.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 skills:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Skill'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Failed to update agent skill override.
 */
export const PATCH = withError(async (req: NextRequest, ctx: Ctx) => {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { did } = await ctx.params;
  if (!(await auth.canAdminAgent(did))) return forbidden();

  const agent = await AgentDAO.findByDid(did);
  if (!agent) return notFound("Agent not found");

  const body = (await req.json()) as {
    enabled?: boolean;
  };

  if (typeof body.enabled !== "boolean") {
    return malformed("enabled must be a boolean");
  }

  const { skillId } = await ctx.params;
  const skill = await RealmSkillDAO.findById(skillId);
  if (!skill) {
    return notFound("Skill not found");
  }
  if (skill.isRequired && !body.enabled) {
    return malformed("Cannot disable a required skill");
  }

  await SkillOverrideDAO.set(did, skillId, body.enabled);

  // Push updated skills config directly to this agent if connected
  sendSkillsConfig(did);

  return NextResponse.json({
    skills: await SkillOverrideDAO.getEffectiveSkills(did),
  });
});
