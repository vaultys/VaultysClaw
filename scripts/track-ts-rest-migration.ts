#!/usr/bin/env node
/**
 * scripts/track-ts-rest-migration.ts
 *
 * Tracks which `app/api/**\/route.ts` handlers have been migrated to the
 * ts-rest pattern (`createNextRoute`) and which still use the legacy
 * `withError` / raw `NextResponse` style.
 *
 * A route file is classified as:
 *   • migrated   — calls `createNextRoute(...)` and has no `withError` left
 *   • legacy     — still uses `withError` / raw handlers (these need migrating)
 *   • mixed      — has BOTH createNextRoute and withError (partially migrated)
 *   • streaming  — uses `text/event-stream` (SSE endpoints intentionally stay
 *                  on `withError`; see app/api/CLAUDE.md) → exempt
 *   • auth       — NextAuth routes under /api/auth → exempt
 *
 * Usage:
 *   pnpm tsx scripts/track-ts-rest-migration.ts            # report
 *   pnpm tsx scripts/track-ts-rest-migration.ts --verbose  # also list migrated
 *   pnpm tsx scripts/track-ts-rest-migration.ts --json     # machine-readable
 *   pnpm tsx scripts/track-ts-rest-migration.ts --strict   # exit 1 if any legacy/mixed remain
 */

import path from "path";
import { glob } from "fs/promises";
import { readFileSync } from "fs";

const API_DIR = path.resolve(__dirname, "../packages/control-plane/app/api");

const isVerbose = process.argv.includes("--verbose");
const asJson = process.argv.includes("--json");
const isStrict = process.argv.includes("--strict");

type Status = "migrated" | "legacy" | "mixed" | "streaming" | "auth";

interface RouteInfo {
  routePath: string;
  methods: string[];
  status: Status;
}

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

function getExportedMethods(content: string): string[] {
  const methods: string[] = [];
  for (const m of HTTP_METHODS) {
    if (
      new RegExp(
        `export\\s+async\\s+function\\s+${m}\\b|export\\s+const\\s+${m}\\s*=`
      ).test(content)
    ) {
      methods.push(m);
    }
  }
  return methods;
}

function fileToRoutePath(filePath: string): string {
  const rel = path.relative(API_DIR, path.dirname(filePath));
  return "/api/" + rel.replace(/\\/g, "/");
}

function classify(routePath: string, content: string): Status {
  if (routePath.startsWith("/api/auth")) return "auth";

  const hasCreateNextRoute = /\bcreateNextRoute\s*\(/.test(content);
  const hasWithError = /\bwithError\s*\(/.test(content);
  const isStreaming = /text\/event-stream/.test(content);

  if (hasCreateNextRoute && hasWithError) return "mixed";
  if (hasCreateNextRoute) return "migrated";
  // No createNextRoute below this point.
  if (isStreaming) return "streaming"; // legitimately stays on withError
  return "legacy";
}

const STATUS_LABEL: Record<Status, string> = {
  migrated: "✅ migrated",
  legacy: "❌ legacy",
  mixed: "🟡 mixed",
  streaming: "🌊 streaming (exempt)",
  auth: "🔑 auth (exempt)",
};

async function main() {
  const routes: RouteInfo[] = [];

  for await (const f of glob(`${API_DIR}/**/route.ts`)) {
    const content = readFileSync(f, "utf-8");
    const methods = getExportedMethods(content);
    if (methods.length === 0) continue; // helper module, no handlers

    routes.push({
      routePath: fileToRoutePath(f),
      methods,
      status: classify(fileToRoutePath(f), content),
    });
  }

  routes.sort((a, b) => a.routePath.localeCompare(b.routePath));

  const by = (s: Status) => routes.filter((r) => r.status === s);
  const migrated = by("migrated");
  const legacy = by("legacy");
  const mixed = by("mixed");
  const streaming = by("streaming");
  const auth = by("auth");

  // Routes that "count" toward migration progress (exempt ones excluded).
  const migratable = routes.filter(
    (r) => r.status !== "streaming" && r.status !== "auth"
  );
  const doneCount = migrated.length;
  const pct = migratable.length
    ? Math.round((doneCount / migratable.length) * 100)
    : 100;

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          summary: {
            total: routes.length,
            migrated: migrated.length,
            legacy: legacy.length,
            mixed: mixed.length,
            streamingExempt: streaming.length,
            authExempt: auth.length,
            migratable: migratable.length,
            percentMigrated: pct,
          },
          routes,
        },
        null,
        2
      )
    );
    process.exit(isStrict && legacy.length + mixed.length > 0 ? 1 : 0);
  }

  console.log("\n🔁 ts-rest Migration Tracker\n");
  console.log(
    `   Progress: ${doneCount}/${migratable.length} migratable routes on ts-rest (${pct}%)`
  );
  const bar = Math.round(pct / 5);
  console.log(`   [${"█".repeat(bar)}${"░".repeat(20 - bar)}]`);
  console.log(
    `\n   ✅ migrated: ${migrated.length}   ❌ legacy: ${legacy.length}   🟡 mixed: ${mixed.length}` +
      `   🌊 streaming-exempt: ${streaming.length}   🔑 auth-exempt: ${auth.length}\n`
  );

  if (legacy.length > 0) {
    console.log(`❌ ${legacy.length} route(s) NOT yet migrated to ts-rest:\n`);
    for (const r of legacy) {
      console.log(`  • [${r.methods.join(",")}] ${r.routePath}`);
    }
    console.log("");
  }

  if (mixed.length > 0) {
    console.log(
      `🟡 ${mixed.length} route(s) PARTIALLY migrated (both createNextRoute and withError):\n`
    );
    for (const r of mixed) {
      console.log(`  • [${r.methods.join(",")}] ${r.routePath}`);
    }
    console.log("");
  }

  if (streaming.length > 0) {
    console.log(
      `🌊 ${streaming.length} streaming (SSE) route(s) — exempt, kept on withError:\n`
    );
    for (const r of streaming) {
      console.log(`  • [${r.methods.join(",")}] ${r.routePath}`);
    }
    console.log("");
  }

  if (isVerbose && migrated.length > 0) {
    console.log(`✅ ${migrated.length} migrated route(s):\n`);
    for (const r of migrated) {
      console.log(`  • [${r.methods.join(",")}] ${r.routePath}`);
    }
    console.log("");
  }

  if (legacy.length === 0 && mixed.length === 0) {
    console.log("🎉 Every migratable route is on ts-rest.\n");
  } else {
    console.log(
      `${STATUS_LABEL.legacy} routes are the work that remains.` +
        (isVerbose ? "" : " Run with --verbose to also list migrated routes.") +
        "\n"
    );
  }

  process.exit(isStrict && legacy.length + mixed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
