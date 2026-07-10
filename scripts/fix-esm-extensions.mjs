#!/usr/bin/env node
// Adds explicit `.js` extensions to relative import/export specifiers in the
// emitted output of an ESM package.
//
// TypeScript (with `moduleResolution: bundler`) emits extensionless relative
// specifiers such as `export * from "./certs"`. Bundlers (Next.js, Vite) resolve
// those fine, but Node's native ESM loader requires a full path with extension.
// This post-build step rewrites each relative specifier to a Node-resolvable
// form so the published `dist` runs under plain `node`:
//
//   ./codec  -> ./codec.js          (a sibling file)
//   ./certs  -> ./certs/index.js    (a directory with an index)
//
// Both `.js` and `.d.ts` files are processed (TypeScript's convention is that
// declaration files reference the `.js` specifier).
//
// Usage: node scripts/fix-esm-extensions.mjs <dir>

import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const targetDir = process.argv[2];
if (!targetDir) {
  console.error("Usage: node scripts/fix-esm-extensions.mjs <dir>");
  process.exit(1);
}

// Matches the specifier of `import ... from "X"`, `export ... from "X"`,
// bare `import "X"`, and dynamic `import("X")` — capturing the quote and path.
const SPECIFIER_RE =
  /(\bfrom\s*|\bimport\s*\(?\s*)(["'])(\.[^"']*)(["'])/g;

async function resolveSpecifier(fileDir, spec) {
  // Already has a JS-ish extension — leave it alone.
  if (/\.(js|mjs|cjs|json)$/.test(spec)) return spec;

  const abs = path.resolve(fileDir, spec);
  // Directory import → point at its index.js
  if (existsSync(abs)) {
    try {
      if ((await stat(abs)).isDirectory()) return `${spec}/index.js`;
    } catch {
      /* fall through */
    }
  }
  // Otherwise treat it as a sibling file.
  return `${spec}.js`;
}

async function processFile(file) {
  const src = await readFile(file, "utf8");
  const fileDir = path.dirname(file);

  // Collect the async rewrites first (regex replace can't be async inline).
  const edits = [];
  let m;
  SPECIFIER_RE.lastIndex = 0;
  while ((m = SPECIFIER_RE.exec(src)) !== null) {
    edits.push({ index: m.index, match: m[0], lead: m[1], quote: m[2], spec: m[3] });
  }
  if (edits.length === 0) return false;

  let out = "";
  let cursor = 0;
  for (const e of edits) {
    const resolved = await resolveSpecifier(fileDir, e.spec);
    out += src.slice(cursor, e.index);
    out += `${e.lead}${e.quote}${resolved}${e.quote}`;
    cursor = e.index + e.match.length;
  }
  out += src.slice(cursor);

  if (out !== src) {
    await writeFile(file, out);
    return true;
  }
  return false;
}

async function walk(dir) {
  let changed = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      changed += await walk(full);
    } else if (/\.(js|d\.ts)$/.test(entry.name)) {
      if (await processFile(full)) changed++;
    }
  }
  return changed;
}

const count = await walk(path.resolve(targetDir));
console.log(`fix-esm-extensions: updated ${count} file(s) in ${targetDir}`);
