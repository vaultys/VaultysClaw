-- Rename the Principal entity to Actor (clearer term for "any DID-holder,
-- human or not" — avoids collision with "agent" already meaning something
-- narrower elsewhere in this monorepo).
ALTER TABLE "Principal" RENAME TO "Actor";
