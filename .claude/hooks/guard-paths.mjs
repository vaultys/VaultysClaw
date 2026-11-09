#!/usr/bin/env node
// PreToolUse hook (Edit|Write|MultiEdit|NotebookEdit): refuse hand edits of generated files, and
// ask before touching what is hard to get right by hand — a Prisma migration, a conformance
// fixture, an .env file.
//
// Only the file tools are guarded: a build, `prisma generate` or a fixture generator run through
// Bash is the legitimate way to change these files.

import { decide, readInput, toolFile } from "./lib.mjs";

/** [test, why] — refused. */
const DENY = [
  [/^packages\/[^/]+\/dist\//, "a build output: edit the package's src/, then rebuild it (`pnpm exec turbo run build --filter=<package>`)"],
  [/^packages\/[^/]+\/\.next\//, "Next.js build output"],
  [/(^|\/)next-env\.d\.ts$/, "rewritten by Next.js on every `next dev` / `next build`"],
  [
    /^packages\/webhook-dispatcher\/prisma\//,
    "a copy of packages/controlplane/prisma/schema.prisma (`pnpm controlplane:webhook:prisma`): edit the control plane's schema",
  ],
  [
    /^packages\/simulator\/prisma\//,
    "a copy of packages/controlplane/prisma/schema.prisma (`pnpm simulator:prisma`): edit the control plane's schema",
  ],
  [/^\.worktree\//, "written by `pnpm worktree:seed` (seeded admin key, simulator identities): reseed with `pnpm worktree:seed --force`"],
];

/** [test, why] — asked. */
const ASK = [
  [
    /^packages\/controlplane\/prisma\/migrations\//,
    "a Prisma migration. Create one with `prisma migrate dev` from a schema.prisma change; a hand edit is only for adjusting a migration just generated and not yet applied anywhere",
  ],
  [
    /^conformance\/.*\.json$/,
    "a conformance fixture, consumed by BOTH the TypeScript (packages/policy, packages/trust) and Go (sdk-go) suites. " +
      "Signed fixtures come from conformance/generate-*.ts; never change one side only, and run both suites after",
  ],
  [/(^|\/)\.env(\.[^/]*)?$/, "an .env file (may hold secrets; in a worktree it is written by scripts/worktree.mjs for its slot)"],
];

const input = readInput();
const rel = toolFile(input);
if (!rel) process.exit(0);
// The committed templates are ordinary files.
if (/\.env\.(example|compose\.example)$/.test(rel) || /^docker\/(simulator|video)\.env$/.test(rel)) process.exit(0);

for (const [test, why] of DENY) if (test.test(rel)) decide("deny", `${rel} is ${why}.`);
for (const [test, why] of ASK) if (test.test(rel)) decide("ask", `${rel} is ${why}.`);
