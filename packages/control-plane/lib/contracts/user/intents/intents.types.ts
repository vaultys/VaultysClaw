import { z } from "zod";
import {
  ListIntentsQuerySchema,
  SendIntentBodySchema,
} from "./intents.schemas";

/** A logged intent with its execution result, as returned by `GET /api/intents`. */
export interface IntentRecord {
  intentId: string;
  agentDid: string | null;
  action: string;
  params: Record<string, unknown>;
  status: string;
  output: Record<string, unknown> | null;
  error: string | null;
  sentAt: string;
  completedAt: string | null;
}

export interface IntentListResponse {
  intents: IntentRecord[];
}

export type SendIntentBody = z.infer<typeof SendIntentBodySchema>;
export type ListIntentsQuery = z.infer<typeof ListIntentsQuerySchema>;
