import { z } from "zod";
import type {
  NotificationChannel,
  NotificationEventDef,
} from "@vaultysclaw/shared";
import {
  MarkReadBodySchema,
  UpdatePreferenceBodySchema,
} from "./notifications.schemas";

export interface NotificationDTO {
  id: string;
  eventType: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  notifications: NotificationDTO[];
  unreadCount: number;
}

export type ChannelPrefs = Record<NotificationChannel, boolean>;

export interface NotificationPreferencesResponse {
  /** Global role of the current user — drives which events are shown. */
  role: string;
  /** Event definitions the user is allowed to configure (filtered by role). */
  events: NotificationEventDef[];
  /** Effective per-event channel preferences (explicit or catalog default). */
  preferences: Record<string, ChannelPrefs>;
}

export type MarkReadBody = z.infer<typeof MarkReadBodySchema>;
export type UpdatePreferenceBody = z.infer<typeof UpdatePreferenceBodySchema>;
