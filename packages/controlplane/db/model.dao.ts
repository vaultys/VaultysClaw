/**
 * Model Registry persistence (docs/PAGE_DESIGN.md §1.8).
 *
 * The one rule this file exists to enforce: `apiKeyEnc` never leaves here by
 * accident. Every read path a page or Server Action uses returns {@link SafeModel},
 * which omits the column at the *query* level (a Prisma `select`, not a delete
 * after the fact) and replaces it with a `hasApiKey` boolean — enough to render
 * "a key is set" without ever loading the ciphertext. The single path that does
 * need it, the LiteLLM push, has to ask for it by name via
 * {@link ModelDAO.findByIdWithSecret}, so it's greppable.
 */
import { prisma } from "./client";
import type { ModelRegistry, Prisma } from "@prisma/client";

/** Every field except `apiKeyEnc`, plus the workspaces this model is granted to. */
const SAFE_SELECT = {
  id: true,
  name: true,
  description: true,
  provider: true,
  modelId: true,
  baseUrl: true,
  litellmModelName: true,
  isActive: true,
  metadata: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
  workspaceAccess: { include: { workspace: true } },
} satisfies Prisma.ModelRegistrySelect;

type SafeRow = Prisma.ModelRegistryGetPayload<{ select: typeof SAFE_SELECT }>;

export type SafeModel = SafeRow & { hasApiKey: boolean };

/** Prisma can report "is this column non-null" without returning it — so `hasApiKey`
 *  costs one extra boolean in the row, not a round-trip through the ciphertext. */
function toSafe(row: SafeRow & { apiKeyEnc?: string | null }): SafeModel {
  const { apiKeyEnc, ...rest } = row as SafeRow & { apiKeyEnc?: string | null };
  return { ...(rest as SafeRow), hasApiKey: !!apiKeyEnc };
}

export class ModelDAO {
  static async create(data: {
    name: string;
    description?: string | null;
    provider: string;
    modelId: string;
    baseUrl: string;
    apiKeyEnc?: string | null;
    litellmModelName?: string | null;
    createdBy?: string | null;
  }): Promise<ModelRegistry> {
    return prisma.modelRegistry.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        provider: data.provider,
        modelId: data.modelId,
        baseUrl: data.baseUrl,
        apiKeyEnc: data.apiKeyEnc ?? null,
        litellmModelName: data.litellmModelName ?? null,
        createdBy: data.createdBy ?? null,
      },
    });
  }

  static async list(): Promise<SafeModel[]> {
    const rows = await prisma.modelRegistry.findMany({
      select: { ...SAFE_SELECT, apiKeyEnc: true },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toSafe);
  }

  static async findById(id: string): Promise<SafeModel | null> {
    const row = await prisma.modelRegistry.findUnique({
      where: { id },
      select: { ...SAFE_SELECT, apiKeyEnc: true },
    });
    return row ? toSafe(row) : null;
  }

  /**
   * The full row, ciphertext included — for the LiteLLM push path only
   * (lib/litellm.ts decrypts it and forwards the plaintext upstream). Named so
   * that a call site handling a secret is obvious in a diff.
   */
  static async findByIdWithSecret(id: string): Promise<ModelRegistry | null> {
    return prisma.modelRegistry.findUnique({ where: { id } });
  }

  /** Active models a given workspace has been granted — the read a workspace-scoped
   *  page or an Actor's config would use. Inactive models are filtered out here
   *  rather than at the call site so "disabled" can't leak through one caller. */
  static async listForWorkspace(workspaceId: string): Promise<SafeModel[]> {
    const rows = await prisma.modelRegistry.findMany({
      where: { isActive: true, workspaceAccess: { some: { workspaceId } } },
      select: { ...SAFE_SELECT, apiKeyEnc: true },
      orderBy: { name: "asc" },
    });
    return rows.map(toSafe);
  }

  static async update(
    id: string,
    data: {
      name?: string;
      description?: string | null;
      provider?: string;
      modelId?: string;
      baseUrl?: string;
      apiKeyEnc?: string | null;
      litellmModelName?: string | null;
      isActive?: boolean;
      metadata?: Prisma.InputJsonValue;
    }
  ): Promise<ModelRegistry> {
    return prisma.modelRegistry.update({ where: { id }, data });
  }

  static async delete(id: string): Promise<void> {
    await prisma.modelRegistry.delete({ where: { id } });
  }

  /** Idempotent: re-granting an existing access row is a no-op, not a unique-constraint
   *  error, so a double-submitted toggle can't 500. */
  static async grantWorkspaceAccess(modelId: string, workspaceId: string): Promise<void> {
    await prisma.modelWorkspaceAccess.upsert({
      where: { modelId_workspaceId: { modelId, workspaceId } },
      create: { modelId, workspaceId },
      update: {},
    });
  }

  /** Also idempotent — revoking an already-revoked grant succeeds silently. */
  static async revokeWorkspaceAccess(modelId: string, workspaceId: string): Promise<void> {
    await prisma.modelWorkspaceAccess.deleteMany({ where: { modelId, workspaceId } });
  }
}
