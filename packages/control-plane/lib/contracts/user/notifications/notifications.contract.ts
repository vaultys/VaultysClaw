import { z } from "zod";
import { c } from "../../contract";
import { commonErrorResponses } from "../../common";
import {
  ListNotificationsQuerySchema,
  MarkReadBodySchema,
  UpdatePreferenceBodySchema,
} from "./notifications.schemas";
import type {
  NotificationListResponse,
  NotificationPreferencesResponse,
} from "./notifications.types";

/**
 * In-app notifications — gated by authentication only (each user sees their own).
 * The live SSE stream (`GET /api/notifications/stream`) is a raw streaming route
 * and is intentionally not part of this contract.
 */
export const notificationsContract = c.router({
  list: {
    method: "GET",
    path: "/api/notifications",
    query: ListNotificationsQuerySchema,
    summary: "List the current user's notifications",
    responses: {
      200: c.type<NotificationListResponse>(),
      ...commonErrorResponses,
    },
  },

  markRead: {
    method: "POST",
    path: "/api/notifications/read",
    body: MarkReadBodySchema,
    summary: "Mark a notification (or all) as read",
    responses: { 200: c.type<{ ok: true }>(), ...commonErrorResponses },
  },

  clearAll: {
    method: "DELETE",
    path: "/api/notifications",
    body: c.noBody(),
    summary: "Delete all of the current user's notifications",
    responses: { 200: c.type<{ ok: true }>(), ...commonErrorResponses },
  },

  remove: {
    method: "DELETE",
    path: "/api/notifications/:id",
    pathParams: z.object({ id: z.string() }),
    body: c.noBody(),
    summary: "Delete a single notification",
    responses: { 200: c.type<{ ok: true }>(), ...commonErrorResponses },
  },

  getPreferences: {
    method: "GET",
    path: "/api/notifications/preferences",
    summary: "Get notification preferences for the current user",
    responses: {
      200: c.type<NotificationPreferencesResponse>(),
      ...commonErrorResponses,
    },
  },

  updatePreference: {
    method: "PUT",
    path: "/api/notifications/preferences",
    body: UpdatePreferenceBodySchema,
    summary: "Update a notification preference for the current user",
    responses: { 200: c.type<{ ok: true }>(), ...commonErrorResponses },
  },
});
