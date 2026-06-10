#!/usr/bin/env node
/**
 * scripts/generate-swagger-docs-missing.ts
 *
 * Generate JSDoc @openapi annotations ONLY for route handlers that have none yet.
 * Already-annotated routes are never touched.
 *
 * Usage:
 *   pnpm swagger:generate:missing            # generate missing annotations
 *   pnpm swagger:generate:missing --dry-run  # list missing routes, no writes
 *
 * Required env (in packages/control-plane/.env):
 *   OPENAI_API_KEY=sk-...
 *   SWAGGER_GEN_MODEL=gpt-4o   (optional, defaults to gpt-4o)
 */

import fs from "fs";
import path from "path";
import { glob } from "fs/promises";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(__dirname, "../packages/control-plane/.env") });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.SWAGGER_GEN_MODEL ?? "gpt-4o";
const API_DIR = path.resolve(__dirname, "../packages/control-plane/app/api");

const isDryRun = process.argv.includes("--dry-run");

// ── helpers ───────────────────────────────────────────────────────────────────

function getExportedMethods(content: string): string[] {
  return ["GET", "POST", "PUT", "PATCH", "DELETE"].filter((m) =>
    new RegExp(
      `export\\s+async\\s+function\\s+${m}|export\\s+const\\s+${m}\\s*=`
    ).test(content)
  );
}

function hasOpenApiAnnotation(content: string, method: string): boolean {
  return new RegExp(
    `/\\*\\*[\\s\\S]*?@openapi[\\s\\S]*?\\*/[\\s\\n]*export\\s+(async\\s+)?(?:function\\s+${method}|const\\s+${method}\\s*=)`
  ).test(content);
}

function fileToApiPath(filePath: string): string {
  const rel = path.relative(API_DIR, path.dirname(filePath));
  return "/api/" + rel.replace(/\\/g, "/").replace(/\[([^\]]+)\]/g, "{$1}");
}

interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function callOpenAI(messages: OpenAIMessage[]): Promise<string> {
  if (!OPENAI_API_KEY)
    throw new Error("OPENAI_API_KEY is not set in packages/control-plane/.env");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0.2 }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0].message.content.trim();
}

const SYSTEM_PROMPT = `You are an expert at writing OpenAPI 3.0 JSDoc annotations for Next.js App Router route handlers.

Given a route file, generate JSDoc @openapi annotations for each exported HTTP method (GET, POST, PUT, PATCH, DELETE).

Rules:
- Output ONLY the JSDoc comment blocks, one per exported method, nothing else.
- Each block must start with /** and end with */.
- Use the @openapi tag with correct indentation.
- Use $ref for common responses: #/components/responses/Unauthorized, #/components/responses/Forbidden, #/components/responses/NotFound, #/components/responses/BadRequest
- Use tags to group related endpoints (match the group from the path, e.g. "Agents", "Workflows").
- For path parameters, use {param} syntax in the path (e.g. /api/agents/{did}).
- Reference schemas where applicable: #/components/schemas/ApiKey etc.
- Keep descriptions concise (1 sentence).
- Format:
/**
 * @openapi
 * /api/path/{param}:
 *   get:
 *     summary: One-line summary
 *     tags: [GroupName]
 *     ...
 */
`;

function buildUserPrompt(
  filePath: string,
  content: string,
  method: string,
  apiPath: string
): string {
  return `File: ${path.relative(process.cwd(), filePath)}
API path: ${apiPath}
Method: ${method}

Source code:
\`\`\`typescript
${content}
\`\`\`

Generate the JSDoc @openapi annotation for the ${method} handler.`;
}

function insertJsdocBeforeExport(
  content: string,
  method: string,
  jsdoc: string
): string {
  const exportPattern = new RegExp(
    `(export\\s+async\\s+function\\s+${method}|export\\s+const\\s+${method}\\s*=)`
  );
  return content.replace(exportPattern, `${jsdoc}\n$1`);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔍 Scanning for undocumented API routes in ${API_DIR}…\n`);

  const files: string[] = [];
  for await (const f of glob(`${API_DIR}/**/route.ts`)) {
    files.push(f);
  }

  const missing: Array<{ filePath: string; method: string; apiPath: string }> =
    [];

  for (const filePath of files.sort()) {
    const content = fs.readFileSync(filePath, "utf-8");
    const methods = getExportedMethods(content);
    const apiPath = fileToApiPath(filePath);

    for (const method of methods) {
      if (!hasOpenApiAnnotation(content, method)) {
        missing.push({ filePath, method, apiPath });
      }
    }
  }

  if (missing.length === 0) {
    console.log("✅ All routes already have @openapi annotations.\n");
    return;
  }

  console.log(`Found ${missing.length} undocumented route(s):\n`);
  for (const { method, apiPath, filePath } of missing) {
    console.log(
      `  • ${method} ${apiPath} (${path.relative(process.cwd(), filePath)})`
    );
  }

  if (isDryRun) {
    console.log(
      "\nDry-run mode — no files written. Remove --dry-run to generate.\n"
    );
    process.exit(missing.length > 0 ? 1 : 0);
  }

  if (!OPENAI_API_KEY) {
    console.error(
      "\n❌ OPENAI_API_KEY not set in packages/control-plane/.env\n"
    );
    process.exit(1);
  }

  console.log("\n✨ Generating annotations…\n");

  let written = 0;
  let errors = 0;

  for (const { filePath, method, apiPath } of missing) {
    console.log(`  ✨ ${method} ${apiPath}`);
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const userPrompt = buildUserPrompt(filePath, content, method, apiPath);
      const response = await callOpenAI([
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ]);

      const jsdocMatch = response.match(/\/\*\*[\s\S]*?\*\//);
      if (!jsdocMatch) {
        console.warn(`     ↳ ⚠️  Could not extract JSDoc block from response`);
        errors++;
        continue;
      }

      const updated = insertJsdocBeforeExport(filePath, method, jsdocMatch[0]);
      // Re-read before writing in case a previous iteration modified this file
      let current = fs.readFileSync(filePath, "utf-8");
      current = insertJsdocBeforeExport(current, method, jsdocMatch[0]);
      fs.writeFileSync(filePath, current, "utf-8");

      console.log(`     ↳ written`);
      written++;
    } catch (e) {
      console.error(`     ↳ ❌ ${(e as Error).message}`);
      errors++;
    }
  }

  console.log("\n────────────────────────────────────────");
  console.log(`✅ Done: ${written} written, ${errors} errors.\n`);
  if (errors > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
