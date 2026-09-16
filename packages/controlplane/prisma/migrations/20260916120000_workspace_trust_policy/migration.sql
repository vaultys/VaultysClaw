-- Per-workspace trust policy overrides (docs/CERTIFICATE_WEB_OF_TRUST.md §5.3).
-- NULL means "inherit the org-wide `Setting`" — resolved in lib/trust-policy.ts.
-- No DEFAULT on either column: a default would make every existing workspace
-- look like it had been explicitly configured, and 0 is a real, meaningful
-- staple TTL that must stay distinguishable from "not set".
ALTER TABLE "Workspace" ADD COLUMN "certFailMode" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "certStapleTtlSeconds" INTEGER;
