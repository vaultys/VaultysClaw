#!/usr/bin/env node
// Post-build step: rewrite extensionless relative import/export specifiers in
// emitted JS to explicit paths so the output is valid Node ESM.
//
// tsc is configured with `moduleResolution: "bundler"`, which lets source use
// extensionless relative imports (e.g. `import "./polyfill"`, `from "./tools"`)
// and emits them verbatim. That's fine under `tsx`/bundlers, but Node's ESM
// loader requires explicit specifiers — `./config` must become `./config.js`
// and the directory import `./tools` must become `./tools/index.js`.
//
// Usage: node scripts/fix-esm-extensions.mjs <dist-dir> [<dist-dir> ...]

import fs from "node:fs";
import path from "node:path";

const KNOWN_EXT = /\.(m?js|cjs|json|node)$/;
// Matches the specifier in: `from "..."`, side-effect `import "..."`,
// dynamic `import("...")`, and `export ... from "..."`.
const SPEC_RE = /(\bfrom\s*|\bimport\s*|\bimport\(\s*)(["'])(\.\.?\/[^"']*)(["'])/g;

function resolveSpecifier(fileDir, spec) {
  if (KNOWN_EXT.test(spec)) return spec; // already explicit
  const base = path.resolve(fileDir, spec);
  if (fs.existsSync(base + ".js")) return spec + ".js";
  if (fs.existsSync(path.join(base, "index.js"))) return spec + "/index.js";
  return spec; // leave untouched if we can't resolve (surfaces as a real error)
}

function fixFile(file) {
  const dir = path.dirname(file);
  const src = fs.readFileSync(file, "utf8");
  let changed = false;
  const out = src.replace(SPEC_RE, (m, lead, q1, spec, q2) => {
    const fixed = resolveSpecifier(dir, spec);
    if (fixed === spec) return m;
    changed = true;
    return `${lead}${q1}${fixed}${q2}`;
  });
  if (changed) fs.writeFileSync(file, out);
  return changed;
}

function walk(dir) {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) count += walk(full);
    else if (entry.name.endsWith(".js")) count += fixFile(full) ? 1 : 0;
  }
  return count;
}

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error("usage: fix-esm-extensions.mjs <dist-dir> [...]");
  process.exit(1);
}
let total = 0;
for (const t of targets) {
  if (!fs.existsSync(t)) continue;
  total += walk(t);
}
console.log(`fix-esm-extensions: rewrote imports in ${total} file(s)`);
