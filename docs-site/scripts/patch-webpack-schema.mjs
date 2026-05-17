/**
 * Patches webpack's ProgressPlugin JSON schema to accept the extra options
 * that webpackbar (used by Docusaurus) passes: name, color, reporter(s).
 *
 * Background: Docusaurus calls  new WebpackBarPlugin({ name, color })
 * and WebpackBarPlugin extends webpack.ProgressPlugin. webpack validates
 * ALL constructor args against its schema, but the schema omits these
 * webpackbar-specific keys, causing a hard ValidationError.
 *
 * This script is run via the "postinstall" npm hook so it re-applies
 * automatically after every `pnpm install`.
 */

import { createRequire } from "module";
import { writeFileSync } from "fs";
import { resolve } from "path";

const require = createRequire(import.meta.url);

// Resolve to the webpack that Docusaurus actually loads (from the pnpm store).
let schemaPath;
try {
  schemaPath = require.resolve("webpack/schemas/plugins/ProgressPlugin.json", {
    paths: [resolve(process.cwd(), "../node_modules")],
  });
} catch {
  // Fallback: try local node_modules
  try {
    schemaPath = require.resolve("webpack/schemas/plugins/ProgressPlugin.json");
  } catch {
    console.log("[patch-webpack-schema] webpack not found — skipping.");
    process.exit(0);
  }
}

const schema = require(schemaPath);
const props = schema?.definitions?.ProgressPluginOptions?.properties;

if (!props) {
  console.log("[patch-webpack-schema] Unexpected schema shape — skipping.");
  process.exit(0);
}

let patched = false;

function ensure(key, def) {
  if (!props[key]) {
    props[key] = def;
    patched = true;
  }
}

ensure("name",      { description: "Name prefix for progress output.", type: "string" });
ensure("color",     { description: "Color of the progress bar.", type: "string" });
ensure("reporters", { description: "Reporters array." });
ensure("reporter",  { description: "Single reporter (string, object, or function)." });

// Remove additionalProperties:false so future webpackbar options don't break.
if (schema.definitions.ProgressPluginOptions.additionalProperties === false) {
  delete schema.definitions.ProgressPluginOptions.additionalProperties;
  patched = true;
}

if (patched) {
  writeFileSync(schemaPath, JSON.stringify(schema, null, 2));
  console.log("[patch-webpack-schema] ProgressPlugin.json patched at", schemaPath);
} else {
  console.log("[patch-webpack-schema] Already up to date.");
}
