#!/usr/bin/env node
// PostToolUse hook (Edit|Write|MultiEdit): after a change that has consequences elsewhere in the
// monorepo, tell Claude what else has to happen. Each reminder is given once per session and
// file kind — then again only if it might have been acted on (see `dist` below).

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { addContext, readInput, ROOT, STATE_DIR, toolFile } from "./lib.mjs";

const input = readInput();
const rel = toolFile(input);
if (!rel) process.exit(0);

/** Once per session per key; `since` (ms) re-arms it when something happened after the last reminder. */
function once(key, since = 0) {
  const file = join(STATE_DIR, `reminder-${input.session_id ?? "default"}-${key}`);
  const last = existsSync(file) ? Number(readFileSync(file, "utf8")) : 0;
  if (last && since < last) return false;
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(file, String(Date.now()));
  return true;
}

const notes = [];

if (rel === "packages/shared/src/webhooks.ts" && once("webhooks")) {
  notes.push(
    "The webhook event catalog changed. Per the root CLAUDE.md, in this same change: (1) catalog entry here, " +
      "(2) the `recordEvent` call at the domain site, (3) the allow-list payload builder in " +
      "packages/controlplane/lib/webhook-payloads.ts (never a secret; name boolean flags `hasProviderKey`, not `hasApiKey`), " +
      "(4) a renderer in RENDERERS (packages/webhook-dispatcher/src/render.ts), (5) EXAMPLE_PAYLOADS in " +
      "packages/controlplane/lib/webhook-docs.ts, (6) every event has a non-empty, secret-free example and `pnpm type-check` is clean."
  );
}

if (rel.startsWith("conformance/") && once("conformance")) {
  notes.push(
    "conformance/ changed: it is the TS↔Go contract. Signed fixtures are regenerated with conformance/generate-*.ts, " +
      "and both sides must pass — `pnpm --filter @vaultysclaw/policy test`, `pnpm --filter @vaultysclaw/trust test` and " +
      "`cd sdk-go && go test ./...` (the Stop hook runs them too)."
  );
}

if (rel === "packages/controlplane/prisma/schema.prisma" && once("schema")) {
  notes.push(
    "schema.prisma changed: create a migration (`pnpm --filter @vaultysclaw/controlplane exec prisma migrate dev --name <name>`, " +
      "inside `node scripts/worktree.mjs exec` in a worktree so it hits this worktree's database). The webhook dispatcher and the " +
      "simulator use copies of this schema: `pnpm controlplane:webhook:prisma`, `pnpm simulator:prisma`."
  );
}

const lib = rel.match(/^packages\/(policy|trust|shared|sdk)\/src\//)?.[1];
if (lib) {
  const dist = join(ROOT, "packages", lib, "dist", "index.js");
  const built = existsSync(dist) ? statSync(dist).mtimeMs : 0;
  if (once(`dist-${lib}`, built)) {
    notes.push(
      `packages/${lib} changed: at runtime (Next.js, vitest of dependent packages, the dispatcher) it is imported from its dist/, ` +
        `not src/. Rebuild before running anything that depends on it: \`pnpm exec turbo run build --filter=@vaultysclaw/${lib}\` ` +
        "(from the repo root, not `cd` + `tsc`)."
    );
  }
}

if (notes.length) addContext("PostToolUse", notes.join("\n\n"));
