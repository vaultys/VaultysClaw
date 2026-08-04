/**
 * The subset of `@vaultysclaw/shared`'s webhook event catalog this package actually emits.
 * `WEBHOOK_EVENTS` also carries packages/control-plane's own groups (Authentication, Users,
 * Agents, Models, Knowledge, Skills, Workflows) — none of those events ever fire here, so both
 * the webhook create/edit forms and the docs page filter down to this list rather than letting an
 * admin subscribe to something that will never arrive.
 */
import { WEBHOOK_EVENTS, type WebhookEventDef } from "@vaultysclaw/shared";

const EMITTED_GROUPS = new Set(["Actors", "Certificates", "Workspaces"]);

export const CONTROLPLANE_WEBHOOK_EVENTS: WebhookEventDef[] = WEBHOOK_EVENTS.filter((e) =>
  EMITTED_GROUPS.has(e.group)
);
