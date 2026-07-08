import { getTemplates } from "@/lib/workflow-templates";
import {
  userContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

/**
 * Route for GET /api/workflows/templates — list available workflow templates.
 */
const handlers = createNextRoute(userContract.workflows, {
  listTemplates: async ({ query, request }) => {

    const templates = getTemplates(query.category);

    return {
      status: 200,
      body: {
        success: true,
        templates: templates.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          category: t.category,
          icon: t.icon,
          suggestedCron: t.suggestedCron,
        })),
      },
    };
  },
});

export const GET = handlers.GET!;
