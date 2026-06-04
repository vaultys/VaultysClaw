#!/usr/bin/env node
/**
 * scripts/check-api-coverage.ts
 *
 * Cross-checks:
 *   1. Routes found in the filesystem (app/api) vs. ROUTE_REGISTRY
 *   2. Routes in ROUTE_REGISTRY vs. the filesystem
 *
 * Usage:
 *   pnpm tsx scripts/check-api-coverage.ts
 *   pnpm tsx scripts/check-api-coverage.ts --verbose   # also list matched routes
 */

import path from "path";
import { glob } from "fs/promises";
import { readFileSync } from "fs";

const API_DIR = path.resolve(__dirname, "../packages/control-plane/app/api");
const REGISTRY_PATH = path.resolve(
  __dirname,
  "../packages/control-plane/lib/route-registry.ts"
);
const isVerbose = process.argv.includes("--verbose");

// ── Parse route-registry.ts ──────────────────────────────────────────────────

interface RegistryEntry {
  path: string;
  methods: string[];
  group: string;
  isPublic?: boolean;
}

function parseRegistry(): RegistryEntry[] {
  const content = readFileSync(REGISTRY_PATH, "utf-8");
  const entries: RegistryEntry[] = [];

  // Extract each { path: "...", methods: [...], ... } object literal
  const entryPattern =
    /\{\s*path:\s*"([^"]+)"[^}]*?methods:\s*\[([^\]]+)\][^}]*?(isPublic:\s*true)?/g;
  let m: RegExpExecArray | null;
  while ((m = entryPattern.exec(content)) !== null) {
    const entryPath = m[1];
    const methods = m[2]
      .split(",")
      .map((s) => s.trim().replace(/['"]/g, ""))
      .filter(Boolean);
    const isPublic = Boolean(m[3]);
    entries.push({ path: entryPath, methods, group: "", isPublic });
  }
  return entries;
}

// ── Parse filesystem ─────────────────────────────────────────────────────────

function getExportedMethods(content: string): string[] {
  const methods: string[] = [];
  for (const m of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
    if (
      new RegExp(
        `export\\s+async\\s+function\\s+${m}|export\\s+const\\s+${m}\\s*=`
      ).test(content)
    ) {
      methods.push(m);
    }
  }
  return methods;
}

function fileToRegistryPath(filePath: string): string {
  const rel = path.relative(API_DIR, path.dirname(filePath));
  return "/api/" + rel.replace(/\\/g, "/");
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n📋 VaultysClaw API Coverage Check\n");

  // 1. Collect filesystem routes
  const fsRoutes = new Map<string, Set<string>>(); // path → Set<method>
  for await (const f of glob(`${API_DIR}/**/route.ts`)) {
    const content = readFileSync(f, "utf-8");
    const methods = getExportedMethods(content);
    if (methods.length === 0) continue;

    const routePath = fileToRegistryPath(f);

    // Skip auth routes
    if (routePath.startsWith("/api/auth")) continue;

    if (!fsRoutes.has(routePath)) fsRoutes.set(routePath, new Set());
    for (const m of methods) fsRoutes.get(routePath)!.add(m);
  }

  // 2. Collect registry routes
  const registry = parseRegistry();
  const registryMap = new Map<string, Set<string>>();
  for (const entry of registry) {
    if (entry.isPublic) continue; // public routes are exempt
    if (entry.path.startsWith("/api/auth")) continue;

    if (!registryMap.has(entry.path)) registryMap.set(entry.path, new Set());
    for (const m of entry.methods) registryMap.get(entry.path)!.add(m);
  }

  // 3. Find routes in FS but NOT in registry
  const missingFromRegistry: string[] = [];
  for (const [routePath, methods] of fsRoutes) {
    if (!registryMap.has(routePath)) {
      missingFromRegistry.push(`${[...methods].join(",")} ${routePath}`);
      continue;
    }
    const regMethods = registryMap.get(routePath)!;
    for (const m of methods) {
      if (!regMethods.has(m)) {
        missingFromRegistry.push(
          `${m} ${routePath}  (route exists in registry but method missing)`
        );
      }
    }
  }

  // 4. Find routes in registry but NOT in FS
  const missingFromFs: string[] = [];
  for (const [routePath, methods] of registryMap) {
    if (!fsRoutes.has(routePath)) {
      missingFromFs.push(`${[...methods].join(",")} ${routePath}`);
      continue;
    }
    const fsMethods = fsRoutes.get(routePath)!;
    for (const m of methods) {
      if (!fsMethods.has(m)) {
        missingFromFs.push(`${m} ${routePath}  (in registry but not in code)`);
      }
    }
  }

  // 5. Report
  if (missingFromRegistry.length === 0 && missingFromFs.length === 0) {
    console.log(
      "✅ All routes are covered — filesystem and registry are in sync.\n"
    );
    if (isVerbose) {
      console.log(`📂 ${fsRoutes.size} route paths found:\n`);
      for (const [p, m] of [...fsRoutes].sort()) {
        console.log(`  [${[...m].join(",")}] ${p}`);
      }
    }
    process.exit(0);
  }

  if (missingFromRegistry.length > 0) {
    console.log(
      `⚠️  ${missingFromRegistry.length} route(s) found in code but MISSING from route-registry.ts:\n`
    );
    for (const r of missingFromRegistry.sort()) {
      console.log(`  • ${r}`);
    }
    console.log(
      "\n  → Add these to packages/control-plane/lib/route-registry.ts\n"
    );
  }

  if (missingFromFs.length > 0) {
    console.log(
      `⚠️  ${missingFromFs.length} route(s) in route-registry.ts but NOT found in the filesystem:\n`
    );
    for (const r of missingFromFs.sort()) {
      console.log(`  • ${r}`);
    }
    console.log(
      "\n  → Remove or fix these entries in packages/control-plane/lib/route-registry.ts\n"
    );
  }

  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
