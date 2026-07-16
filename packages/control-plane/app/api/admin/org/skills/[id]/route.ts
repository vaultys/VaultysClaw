/**
 * PATCH  /api/admin/org/skills/[id]   — update an org skill (global admin only)
 * DELETE /api/admin/org/skills/[id]   — remove from catalog (global admin only)
 */

import { APIException } from "@/lib/api/utils/api-utils";
import { getAuthContext } from "@/lib/auth-utils";
import { OrgSkillDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { adminContract } from "@/lib/contracts";
import { enqueueNotification } from "@/lib/notification-queue";
import { enqueueWebhook } from "@/lib/webhook-queue";
import { skillPayload } from "@/lib/webhook-payloads";

const handlers = createNextRoute(adminContract.orgSkills, {
  update: async ({ params, body }) => {

    if (!(await OrgSkillDAO.findById(params.id)))
      throw new APIException("NOT_FOUND", "Skill not found");

    await OrgSkillDAO.update(params.id, {
      description: body.description,
      version: body.version,
      icon: body.icon,
      content: body.content,
      configSchema: body.configSchema,
    });

    const skill = await OrgSkillDAO.findById(params.id);
    if (skill)
      void enqueueWebhook({
        eventType: "skill.updated",
        payload: skillPayload(skill),
      });
    return { status: 200, body: { skill: skill! } };
  },

  remove: async ({ params, request }) => {
    const auth = await getAuthContext(request);

    const skill = await OrgSkillDAO.findById(params.id);
    if (!skill) throw new APIException("NOT_FOUND", "Skill not found");

    await OrgSkillDAO.delete(params.id);

    void enqueueNotification({
      eventType: "skill.removed",
      data: { skillId: params.id, skillName: skill.name, actorDid: auth.did },
    });
    void enqueueWebhook({
      eventType: "skill.deleted",
      payload: skillPayload(skill),
    });

    return { status: 200, body: { success: true } };
  },
});

export const PATCH = handlers.PATCH!;
export const DELETE = handlers.DELETE!;
