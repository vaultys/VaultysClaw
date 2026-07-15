import type { ModelRegistry, Prisma } from "@prisma/client";
import { z } from "zod";
import {
  CreateModelBodySchema,
  TestModelBodySchema,
  UpdateModelBodySchema,
} from "./models.schemas";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

/**
 * A model registry entry with its workspace-access rows joined in — everything the
 * models list UI needs in a single query (the `apiKeyEnc` secret is excluded by
 * the `select`). Mirrors the `AgentWithInfo` pattern; the matching query lives
 * in `ModelDAO.findAll`. Consumers derive the workspace count from `workspaceAccess.length`.
 */
export type SafeModel = Prisma.ModelRegistryGetPayload<{
  select: {
    id: true;
    name: true;
    description: true;
    provider: true;
    modelId: true;
    baseUrl: true;
    litellmModelName: true;
    status: true;
    metadata: true;
    createdBy: true;
    createdAt: true;
    updatedAt: true;
    workspaceAccess: {
      include: {
        workspace: true;
      };
    };
  };
}> & { hasApiKey: boolean };

/** Response of `POST /api/admin/models` — the created entry (sans secret) + LiteLLM status. */
export type CreatedModel = Omit<ModelRegistry, "apiKeyEnc"> & {
  litellmRegistered: boolean;
};

export type CreateModelBody = z.infer<typeof CreateModelBodySchema>;
export type TestModelBody = z.infer<typeof TestModelBodySchema>;
export type UpdateModelBody = z.infer<typeof UpdateModelBodySchema>;
export type LiteLlmModel = { name: string; params: Record<string, unknown> };
