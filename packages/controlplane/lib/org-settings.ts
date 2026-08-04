/**
 * Shared `Setting` keys + defaults for the org-wide config surfaced on
 * `/admin/settings` (docs/PAGE_DESIGN.md §1.9) — kept in one place so the
 * page, its Server Actions, and anything else that reads a value (e.g.
 * `app/admin/layout.tsx` for the sidebar org name) can't drift on the key
 * string or the "what does an unset row mean" default.
 */

export const SETTINGS_KEYS = {
  orgName: "org.name",
  trustFailMode: "trust.failMode",
  trustStapleTtlSeconds: "trust.stapleTtlSeconds",
} as const;

export const DEFAULT_ORG_NAME = "VaultysClaw";

/** docs/CERTIFICATE_WEB_OF_TRUST.md §5.1 — hardcoded safe default is fail-closed. */
export const DEFAULT_TRUST_FAIL_MODE: "open" | "closed" = "closed";

/** §5.2 — 0 means "force a live query every time," the strictest option, not "disabled." */
export const DEFAULT_STAPLE_TTL_SECONDS = 0;
