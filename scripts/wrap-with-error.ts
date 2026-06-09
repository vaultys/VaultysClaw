#!/usr/bin/env node
/**
 * scripts/wrap-with-error.ts
 *
 * Wraps all exported HTTP method handlers in API routes with `withError`
 * from `@/lib/api/handlers/with-error`.
 *
 * Transformations applied:
 *   1. `export async function METHOD(params) { try { body } catch { 5xx } }`
 *      → `export const METHOD = withError(async (params) => { body });`
 *      (outer try/catch whose catch only returns a 5xx is removed)
 *
 *   2. `export async function METHOD(params) { body }`
 *      → `export const METHOD = withError(async (params) => { body });`
 *
 *   3. Already `export const METHOD = withError(...)` → skipped
 *
 * Usage:
 *   pnpm tsx scripts/wrap-with-error.ts            # apply changes
 *   pnpm tsx scripts/wrap-with-error.ts --dry-run  # preview only
 */

import fs from "fs";
import path from "path";
import { glob } from "fs/promises";

const API_DIR = path.resolve(__dirname, "../packages/control-plane/app/api");
const isDryRun = process.argv.includes("--dry-run");

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const IMPORT_LINE = `import { withError } from "@/lib/api/handlers/with-error";`;

// ---------------------------------------------------------------------------
// Bracket/paren matching — handles strings, template literals, and comments
// ---------------------------------------------------------------------------

function findMatchingClose(content: string, openIndex: number): number {
  const open = content[openIndex];
  const close = open === "{" ? "}" : open === "(" ? ")" : "]";

  let depth = 0;
  let i = openIndex;
  let inString: string | null = null;
  let inLineComment = false;
  let inBlockComment = false;
  let inTemplate = false;

  while (i < content.length) {
    const ch = content[i];
    const peek = content[i + 1];

    // Escape sequences inside strings or template literals
    if ((inString || inTemplate) && ch === "\\") {
      i += 2;
      continue;
    }

    // Line comment start
    if (!inString && !inTemplate && !inLineComment && !inBlockComment && ch === "/" && peek === "/") {
      inLineComment = true;
      i += 2;
      continue;
    }
    // Block comment start
    if (!inString && !inTemplate && !inLineComment && !inBlockComment && ch === "/" && peek === "*") {
      inBlockComment = true;
      i += 2;
      continue;
    }
    // Line comment end
    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      i++;
      continue;
    }
    // Block comment end
    if (inBlockComment) {
      if (ch === "*" && peek === "/") { inBlockComment = false; i += 2; } else i++;
      continue;
    }

    // String open/close
    if (!inString && !inTemplate && (ch === '"' || ch === "'")) {
      inString = ch;
      i++;
      continue;
    }
    if (inString && ch === inString) {
      inString = null;
      i++;
      continue;
    }
    if (inString) { i++; continue; }

    // Template literal
    if (!inString && ch === "`") {
      inTemplate = !inTemplate;
      i++;
      continue;
    }
    if (inTemplate) { i++; continue; }

    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Detect if a catch block body only does error logging + a 5xx response.
// ---------------------------------------------------------------------------

function isSimpleCatchBody(catchBody: string): boolean {
  const trimmed = catchBody.trim();
  return /^(console\.\w+\s*\([^)]*\)\s*;\s*)*return\s+NextResponse\.json\s*\([\s\S]*?status:\s*5\d\d[\s\S]*?\)\s*;?\s*$/.test(
    trimmed
  );
}

// ---------------------------------------------------------------------------
// Find the opening brace `{` of the function body after the parameter list.
// Skips optional `: ReturnType` annotation (handles generics like Promise<T>).
// ---------------------------------------------------------------------------

function findFunctionBodyBrace(content: string, afterParenClose: number): number {
  let i = afterParenClose + 1;
  let angleDepth = 0;

  while (i < content.length) {
    const ch = content[i];
    if (ch === "<") { angleDepth++; i++; continue; }
    if (ch === ">") { angleDepth = Math.max(0, angleDepth - 1); i++; continue; }
    if (angleDepth > 0) { i++; continue; }
    if (ch === "{") return i;
    i++;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Remove one level of indentation (2 spaces) from a body block.
// ---------------------------------------------------------------------------

function dedentOnce(body: string): string {
  return body
    .split("\n")
    .map((line) => (line.startsWith("  ") ? line.slice(2) : line))
    .join("\n");
}

// ---------------------------------------------------------------------------
// Transform one HTTP method handler in `content` starting at `declStart`.
// Returns the new file content, or null if the transformation fails.
// ---------------------------------------------------------------------------

function transformMethod(
  content: string,
  method: string,
  declStart: number
): string | null {
  // Find the opening paren of the parameter list
  const parenStart = content.indexOf("(", declStart);
  if (parenStart === -1) return null;

  const parenEnd = findMatchingClose(content, parenStart);
  if (parenEnd === -1) return null;

  const params = content.slice(parenStart + 1, parenEnd);

  // Find the opening brace of the function body (skips return type annotation)
  const braceStart = findFunctionBodyBrace(content, parenEnd);
  if (braceStart === -1 || content[braceStart] !== "{") return null;

  const braceEnd = findMatchingClose(content, braceStart);
  if (braceEnd === -1) return null;

  const rawBody = content.slice(braceStart + 1, braceEnd);
  const trimmedBody = rawBody.trim();

  let finalBody = rawBody;

  // Check if the entire body is a single try { ... } catch { 5xx } block
  if (/^try\s*\{/.test(trimmedBody)) {
    const tryKwOffset = rawBody.indexOf("try");
    const tryBraceOffset = rawBody.indexOf("{", tryKwOffset);
    // Work on absolute indices
    const tryBraceAbs = braceStart + 1 + tryBraceOffset;
    const tryBraceEndAbs = findMatchingClose(content, tryBraceAbs);

    if (tryBraceEndAbs !== -1) {
      const afterTry = content.slice(tryBraceEndAbs + 1, braceEnd);
      const catchMatch = /^\s*catch\s*\(/.exec(afterTry);

      if (catchMatch) {
        const catchParenAbs =
          tryBraceEndAbs + 1 + afterTry.indexOf("(", catchMatch.index);
        const catchParenEndAbs = findMatchingClose(content, catchParenAbs);

        if (catchParenEndAbs !== -1) {
          let catchBraceAbs = catchParenEndAbs + 1;
          while (catchBraceAbs < content.length && /\s/.test(content[catchBraceAbs]))
            catchBraceAbs++;

          if (content[catchBraceAbs] === "{") {
            const catchBraceEndAbs = findMatchingClose(content, catchBraceAbs);

            if (catchBraceEndAbs !== -1) {
              const catchBody = content.slice(catchBraceAbs + 1, catchBraceEndAbs);
              const afterCatch = content.slice(catchBraceEndAbs + 1, braceEnd).trim();

              if (afterCatch === "" && isSimpleCatchBody(catchBody)) {
                // Safe to strip the try/catch wrapper
                finalBody = dedentOnce(content.slice(tryBraceAbs + 1, tryBraceEndAbs));
              }
            }
          }
        }
      }
    }
  }

  const newDecl =
    `export const ${method} = withError(async (${params}) => {` +
    finalBody +
    `});`;

  return content.slice(0, declStart) + newDecl + content.slice(braceEnd + 1);
}

// ---------------------------------------------------------------------------
// Add the withError import after the last existing import line.
// ---------------------------------------------------------------------------

function addImport(content: string): string {
  if (content.includes(IMPORT_LINE)) return content;

  const importRe = /^import\s.+$/gm;
  let lastEnd = -1;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(content)) !== null) {
    lastEnd = m.index + m[0].length;
  }

  if (lastEnd === -1) return IMPORT_LINE + "\n" + content;
  return content.slice(0, lastEnd) + "\n" + IMPORT_LINE + content.slice(lastEnd);
}

// ---------------------------------------------------------------------------
// Process a single file — returns { newContent, methodsTransformed, warnings }
// ---------------------------------------------------------------------------

function processFile(filePath: string): {
  newContent: string;
  methodsTransformed: string[];
  warnings: string[];
} {
  let content = fs.readFileSync(filePath, "utf-8");
  const relPath = path.relative(process.cwd(), filePath);
  const methodsTransformed: string[] = [];
  const warnings: string[] = [];

  for (const method of HTTP_METHODS) {
    // Skip already-wrapped handlers
    if (
      new RegExp(`export\\s+const\\s+${method}\\s*=\\s*withError\\s*\\(`).test(content)
    )
      continue;

    const funcMatch = new RegExp(
      `export\\s+async\\s+function\\s+${method}\\s*\\(`
    ).exec(content);
    if (!funcMatch) continue;

    const transformed = transformMethod(content, method, funcMatch.index);
    if (transformed && transformed !== content) {
      content = transformed;
      methodsTransformed.push(method);
    } else {
      warnings.push(`${relPath}: ${method} — could not transform (check manually)`);
    }
  }

  if (methodsTransformed.length > 0) {
    content = addImport(content);
  }

  return { newContent: content, methodsTransformed, warnings };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n🔧 wrap-with-error${isDryRun ? " (dry run)" : ""}\n`);

  const files: string[] = [];
  for await (const f of glob(`${API_DIR}/**/route.ts`)) files.push(f);
  files.sort();

  let totalModified = 0;
  let totalSkipped = 0;
  const allWarnings: string[] = [];

  for (const filePath of files) {
    const relPath = path.relative(process.cwd(), filePath);
    const original = fs.readFileSync(filePath, "utf-8");

    const hasUnwrapped = HTTP_METHODS.some((m) =>
      new RegExp(`export\\s+async\\s+function\\s+${m}\\s*\\(`).test(original)
    );
    if (!hasUnwrapped) {
      totalSkipped++;
      continue;
    }

    const { newContent, methodsTransformed, warnings } = processFile(filePath);
    allWarnings.push(...warnings);

    if (methodsTransformed.length > 0) {
      if (!isDryRun) fs.writeFileSync(filePath, newContent, "utf-8");
      console.log(`  ✅ ${relPath}  [${methodsTransformed.join(", ")}]`);
      totalModified++;
    } else {
      totalSkipped++;
    }
  }

  if (allWarnings.length > 0) {
    console.log("\n⚠️  Could not auto-transform (check manually):\n");
    for (const w of allWarnings) console.log(`  ${w}`);
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
