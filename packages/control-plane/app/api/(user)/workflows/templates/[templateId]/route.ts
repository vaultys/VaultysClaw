import { getTemplate } from "@/lib/workflow-templates";
import { APIException } from "@/lib/api/utils/api-utils";
import {
  userContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

/**
 * Route for GET /api/workflows/templates/:templateId — fetch one template.
 */
const handlers = createNextRoute(userContract.workflows, {
  getTemplate: async ({ params, request }) => {

    const template = getTemplate(params.templateId);
    if (!template) throw new APIException("NOT_FOUND", "Template not found");

    return {
      status: 200,
      body: {
        success: true,
        template: template as unknown as Record<string, unknown>,
      },
    };
  },
});

export const GET = handlers.GET!;
