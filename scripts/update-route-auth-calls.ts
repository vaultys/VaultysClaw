#!/usr/bin/env node
/**
 * scripts/update-route-auth-calls.ts
 *
 * Migrates all API route handlers to pass `request` to `getAuthContext(request)`.
 *
 * Before: getAuthContext()
 * After:  getAuthContext(<firstParamName>)   e.g. getAuthContext(req)
 *
 * Handles all parameter naming patterns:
 *   export async function GET(request: NextRequest)     → getAuthContext(request)
 *   export async function GET(request?: Request)        → getAuthContext(request)
 *   export async function GET(req: NextRequest)         → getAuthContext(req)
 *   export async function GET(_request: NextRequest)    → getAuthContext(_request)
 *   export async function GET(\n  _request: NextRequest,\n  ctx\n)  → multi-line
 *
 * Functions with no parameter are skipped and reported.
 *
 * Usage:
 *   pnpm tsx scripts/update-route-auth-calls.ts            # apply changes
 *   pnpm tsx scripts/update-route-auth-calls.ts --dry-run  # preview, no writes
 */

import fs from "fs";
import path from "path";
import { glob } from "fs/promises";

const API_DIR = path.resolve(__dirname, "../packages/control-plane/app/api");
const isDryRun = process.argv.includes("--dry-run");

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/**
 * Extract the first parameter name from an exported HTTP method handler.
 * Handles single-line and multi-line signatures.
 * Returns null if the function has no parameters.
 */
function extractFirstParamName(content: string, method: string): string | null {
  // Try single-line: export async function GET(req: ...) or GET(request?: ...)
  const singleLine = new RegExp(
    `export\\s+async\\s+function\\s+${method}\\s*\\(\\s*([a-zA-Z_][a-zA-Z0-9_]*)[?]?\\s*[,:\\)]`
  );
  const mSingle = singleLine.exec(content);
  if (mSingle) return mSingle[1];

  // Try multi-line: export async function GET(\n  _request: NextRequest,\n  ...
  // Capture everything between the opening paren and the next non-whitespace identifier
  const multiLine = new RegExp(
    `export\\s+async\\s+function\\s+${method}\\s*\\(\\s*\\n\\s*([a-zA-Z_][a-zA-Z0-9_]*)[?]?\\s*[,:\\)]`
  );
  const mMulti = multiLine.exec(content);
  if (mMulti) return mMulti[1];

  // Empty params: GET() or GET(\n)
  const empty = new RegExp(
    `export\\s+async\\s+function\\s+${method}\\s*\\(\\s*\\)`
  );
  if (empty.test(content)) return null;

  return null;
}

async function main() {
  console.log(`\n🔧 update-route-auth-calls${isDryRun ? " (dry run)" : ""}\n`);

  const files: string[] = [];
  for await (const f of glob(`${API_DIR}/**/route.ts`)) {
    files.push(f);
  }

  let totalModified = 0;
  let totalSkipped = 0;
  const noParam: string[] = [];

  for (const filePath of files.sort()) {
    const relPath = path.relative(process.cwd(), filePath);
    let content = fs.readFileSync(filePath, "utf-8");

    if (!content.includes("getAuthContext()")) {
      totalSkipped++;
      continue;
    }

    let modified = false;

    for (const method of HTTP_METHODS) {
      const exportsMethod =
        new RegExp(`export\\s+async\\s+function\\s+${method}`).test(content) ||
        new RegExp(`export\\s+const\\s+${method}\\s*=`).test(content);

      if (!exportsMethod) continue;
      if (!/getAuthContext\(\s*\)/.test(content)) continue;

      const paramName = extractFirstParamName(content, method);

      if (paramName === null) {
        noParam.push(
          `  ⚠️  ${relPath}: ${method} — no request param, skip manually`
        );
        continue;
      }

      const before = content;
      // Replace getAuthContext() with getAuthContext(<paramName>)
      content = content.replace(
        /getAuthContext\(\s*\)/g,
        `getAuthContext(${paramName})`
      );
      if (content !== before) modified = true;
    }

    if (modified) {
      if (!isDryRun) {
        fs.writeFileSync(filePath, content, "utf-8");
      }
      console.log(`  ✅ ${relPath}`);
      totalModified++;
    }
  }

  if (noParam.length > 0) {
    console.log(
      "\n⚠️  Handlers with no request param (manual update needed):\n"
    );
    for (const w of noParam) console.log(w);
  }

  console.log(
    `\n────────────────────────────────────────\n` +
      `${isDryRun ? "[dry run] " : ""}${totalModified} file(s) ${isDryRun ? "would be " : ""}updated, ${totalSkipped} skipped.\n`
  );

  if (isDryRun && totalModified > 0) {
    console.log("Run without --dry-run to apply changes.\n");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
