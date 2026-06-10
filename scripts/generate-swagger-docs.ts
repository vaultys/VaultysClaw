#!/usr/bin/env node
/**
 * scripts/generate-swagger-docs.ts
 *
 * Auto-generate or update JSDoc @openapi annotations on all API route handlers
 * using the OpenAI API.
 *
 * Usage:
 *   pnpm tsx scripts/generate-swagger-docs.ts            # process undocumented routes
 *   pnpm tsx scripts/generate-swagger-docs.ts --check    # report only, no writes
 *   pnpm tsx scripts/generate-swagger-docs.ts --force    # regenerate all routes
 *
 * Required env (in packages/control-plane/.env):
 *   OPENAI_API_KEY=sk-...
 *   SWAGGER_GEN_MODEL=gpt-4o   (optional, defaults to gpt-4o)
 */

import fs from "fs";
import path from "path";
import { glob } from "fs/promises";
import { config as loadEnv } from "dotenv";

// Load control-plane .env
loadEnv({ path: path.resolve(__dirname, "../packages/control-plane/.env") });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.SWAGGER_GEN_MODEL ?? "gpt-4o";
const API_DIR = path.resolve(__dirname, "../packages/control-plane/app/api");

const isCheck = process.argv.includes("--check");
const isForce = process.argv.includes("--force");

// ── helpers ──────────────────────────────────────────────────────────────────

/** Extract exported HTTP method function names from a route file */
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

/** Return true if the file already has @openapi JSDoc for the given method */
function hasOpenApiAnnotation(content: string, method: string): boolean {
  const pattern = new RegExp(
    `/\\*\\*[\\s\\S]*?@openapi[\\s\\S]*?\\*/[\\s\\n]*export\\s+(async\\s+)?(?:function\\s+${method}|const\\s+${method}\\s*=)`
  );
  return pattern.test(content);
}

/** Build the relative API path from the file path */
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
  apiPath: string,
  existing: string | null
): string {
  const base = `File: ${path.relative(process.cwd(), filePath)}
API path: ${apiPath}
Method: ${method}

Source code:
\`\`\`typescript
${content}
\`\`\`
`;

  if (existing) {
    return (
      base +
      `\nExisting annotation for ${method}:\n\`\`\`\n${existing}\n\`\`\`\n\n` +
      `Does this annotation need updating based on the current code? ` +
      `If YES, output the updated JSDoc block. If NO, output exactly the string: SKIP`
    );
  }

  return (
    base + `\nGenerate the JSDoc @openapi annotation for the ${method} handler.`
  );
}

/** Insert a JSDoc block immediately before the export of the given method */
function insertJsdocBeforeExport(
  content: string,
  method: string,
  jsdoc: string
): string {
  // Match the export line (with or without async)
  const exportPattern = new RegExp(
    `(export\\s+async\\s+function\\s+${method}|export\\s+const\\s+${method}\\s*=)`
  );
  return content.replace(exportPattern, `${jsdoc}\n$1`);
}

/** Remove an existing JSDoc @openapi block before a method export */
function removeExistingJsdoc(content: string, method: string): string {
  const pattern = new RegExp(
    `/\\*\\*[\\s\\S]*?@openapi[\\s\\S]*?\\*/\\s*\\n(export\\s+(async\\s+)?function\\s+${method})`,
    "g"
  );
  return content.replace(pattern, "$1");
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔍 Scanning API routes in ${API_DIR}…\n`);

  const files: string[] = [];
  for await (const f of glob(`${API_DIR}/**/route.ts`)) {
    files.push(f);
  }

  const undocumented: string[] = [];
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const filePath of files.sort()) {
    const content = fs.readFileSync(filePath, "utf-8");
    const methods = getExportedMethods(content);
    if (methods.length === 0) continue;

    const apiPath = fileToApiPath(filePath);
    const relPath = path.relative(process.cwd(), filePath);

    for (const method of methods) {
      const hasAnnotation = hasOpenApiAnnotation(content, method);

      if (!hasAnnotation) {
        undocumented.push(`${method} ${apiPath} (${relPath})`);
      }

      if (isCheck) continue;
      if (hasAnnotation && !isForce) continue;

      if (!OPENAI_API_KEY) {
        console.error(
          `❌ OPENAI_API_KEY not set — cannot generate annotations. Use --check to inspect only.`
        );
        process.exit(1);
      }

      // Extract existing annotation if present (for update mode)
      let existingAnnotation: string | null = null;
      if (hasAnnotation) {
        const m = new RegExp(
          `(/\\*\\*[\\s\\S]*?@openapi[\\s\\S]*?\\*/)\\s*\\nexport\\s+(async\\s+)?function\\s+${method}`
        ).exec(content);
        existingAnnotation = m ? m[1] : null;
      }

      console.log(`  ${hasAnnotation ? "🔄" : "✨"} ${method} ${apiPath}`);

      try {
        const userPrompt = buildUserPrompt(
          filePath,
          content,
          method,
          apiPath,
          existingAnnotation
        );
        const response = await callOpenAI([
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ]);

        if (response.trim() === "SKIP") {
          console.log(`     ↳ up to date, skipping`);
          skipped++;
          continue;
        }

        // Extract JSDoc block from response (in case the model adds prose)
        const jsdocMatch = response.match(/\/\*\*[\s\S]*?\*\//);
        if (!jsdocMatch) {
          console.warn(
            `     ↳ ⚠️  Could not extract JSDoc block from response`
          );
          errors++;
          continue;
        }
        const jsdoc = jsdocMatch[0];

        // Read fresh content (may have been modified by previous iteration)
        let currentContent = fs.readFileSync(filePath, "utf-8");

        if (hasAnnotation) {
          currentContent = removeExistingJsdoc(currentContent, method);
        }
        currentContent = insertJsdocBeforeExport(currentContent, method, jsdoc);
        fs.writeFileSync(filePath, currentContent, "utf-8");

        console.log(`     ↳ written`);
        updated++;
      } catch (e) {
        console.error(`     ↳ ❌ ${(e as Error).message}`);
        errors++;
      }
    }
  }

  // Summary
  console.log("\n────────────────────────────────────────");

  if (isCheck) {
    if (undocumented.length === 0) {
      console.log("✅ All routes are documented with @openapi annotations.\n");
    } else {
      console.log(
        `⚠️  ${undocumented.length} route(s) missing @openapi annotations:\n`
      );
      for (const r of undocumented) {
        console.log(`  • ${r}`);
      }
      console.log(
        "\nRun without --check to generate them (requires OPENAI_API_KEY in packages/control-plane/.env).\n"
      );
    }
    process.exit(undocumented.length > 0 ? 1 : 0);
  }

  console.log(
    `✅ Done: ${updated} updated, ${skipped} skipped (up to date), ${errors} errors.\n`
  );
  if (errors > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
