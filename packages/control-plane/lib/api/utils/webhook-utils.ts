import crypto from "crypto";
import type { Webhook as PrismaWebhook } from "@prisma/client";
import type { Webhook, WebhookWithSecret } from "@/lib/contracts";

/** A short, non-reversible preview of the signing secret for list views. */
function secretPreview(secret: string): string {
  if (!secret) return "";
  return `${secret.slice(0, 6)}…${secret.slice(-4)}`;
}

/** Serialize a Prisma Webhook row to the API shape (secret masked). */
export function toWebhook(row: PrismaWebhook): Webhook {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    url: row.url,
    events: (row.events as string[]) ?? [],
    isActive: row.isActive,
    secretPreview: secretPreview(row.secret),
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Serialize including the full raw secret — only for create / regenerate. */
export function toWebhookWithSecret(row: PrismaWebhook): WebhookWithSecret {
  return { ...toWebhook(row), secret: row.secret };
}

/** Generate a new HMAC signing secret: whsec_<64 hex chars>. */
export function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(32).toString("hex")}`;
}
