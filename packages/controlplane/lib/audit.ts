/**
 * The single call site every domain mutation goes through to be both audited and delivered
 * (docs/REBUILD_ARCHITECTURE.md §7) — an Audit Log entry and a Webhook/Notification Channel event
 * were always the same "what happened" fact, just two different consumers of it, so this writes
 * both rather than making every call site remember to do so separately.
 *
 * The audit write is awaited (a reliability guarantee the webhook queue deliberately isn't —
 * enqueueWebhook is fire-and-forget and silently no-ops without Redis); the webhook/notification
 * side stays exactly as before.
 */
import { AuditLogDAO } from "@/db";
import { enqueueWebhook } from "./webhook-queue";
import type { PerformedBy } from "./webhook-payloads";

export interface RecordEventInput {
  eventType: string;
  payload: Record<string, unknown>;
  performedBy?: PerformedBy | null;
  targetType?: string | null;
  targetId?: string | null;
}

export async function recordEvent(input: RecordEventInput): Promise<void> {
  await AuditLogDAO.create({
    eventType: input.eventType,
    actorDid: input.performedBy?.did ?? null,
    actorName: input.performedBy?.name ?? null,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    details: input.payload,
  });
  void enqueueWebhook({ eventType: input.eventType, payload: input.payload });
}
