/**
 * The subset of `@vaultysclaw/shared`'s webhook event catalog this package actually emits.
 * `WEBHOOK_EVENTS` also carries packages/control-plane's own groups (Authentication, Users,
 * Agents, Knowledge, Skills, Workflows) — none of those events ever fire here, so both the
 * webhook create/edit forms and the docs page filter down to this list rather than letting an
 * admin subscribe to something that will never arrive.
 *
 * "Models" joined the list when the Model Registry was built here; its `model.*` events are the
 * shared catalog's own, unchanged, since the entity means the same thing in both packages.
 * "Capabilities" is the custom-capability registry (docs/CUSTOM_CAPABILITIES.md).
 */
import { WEBHOOK_EVENTS, type WebhookEventDef } from "@vaultysclaw/shared";

const EMITTED_GROUPS = new Set(["Actors", "Certificates", "Workspaces", "Models", "Capabilities"]);

export const CONTROLPLANE_WEBHOOK_EVENTS: WebhookEventDef[] = WEBHOOK_EVENTS.filter((e) =>
  EMITTED_GROUPS.has(e.group)
);
