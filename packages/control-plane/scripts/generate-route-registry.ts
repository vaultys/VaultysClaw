#!/usr/bin/env tsx
/**
 * Scans all app/api route.ts files recursively and regenerates lib/route-registry.ts.
 *
 * For each route file it:
 *   1. Derives the API path from the filesystem path
 *   2. Detects exported HTTP methods (GET, POST, PUT, PATCH, DELETE)
 *   3. Reads the @openapi JSDoc block for `tags` (→ group) and `summary` (→ description)
 *   4. Falls back to path-based heuristics when JSDoc is absent
 *   5. Marks a route as public when no auth utilities are imported
 *
 * Usage:  pnpm tsx scripts/generate-route-registry.ts
 *         pnpm tsx scripts/generate-route-registry.ts --dry-run   (print, don't write)
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

// ─── config ────────────────────────────────────────────────────────────────
const API_DIR = path.resolve(__dirname, "../app/api");
const OUTPUT = path.resolve(__dirname, "../lib/route-registry.ts");
const DRY_RUN = process.argv.includes("--dry-run");

// Routes that are never meant to appear in the registry
const SKIP_PATHS = new Set([
  "/api/auth/[...nextauth]",
  "/api/docs/swagger.json",
  "/api/test/[...path]",
  // internal VaultysId handshake endpoints
  "/api/user/connect",
  "/api/user/listen/[token]",
  "/api/user/request/[token]",
  "/api/user/status",
  "/api/user/bastion/associate",
  "/api/user/bastion/connect",
  "/api/user/bastion/listen/[token]",
  "/api/user/p2p/connect",
]);

// Auth-related imports that indicate a protected route
const AUTH_IMPORTS = [
  "getAuthContext",
  "requireAuth",
  "withAuth",
  "getServerSession",
  "checkApiKey",
  "unauthorized",
];

// ─── path → group mapping ───────────────────────────────────────────────────
const PATH_GROUP_MAP: Array<[RegExp, string, string?]> = [
  [/^\/api\/health$/, "System"],
  [/^\/api\/setup/, "System"],
  [/^\/api\/about$/, "System"],
  [/^\/api\/agent(s)?\//, "Agents"],
  [/^\/api\/registrations/, "Registrations"],
  [/^\/api\/intents/, "Intents"],
  [/^\/api\/workflow-approvals/, "Workflow Approvals"],
  [/^\/api\/workflow-runs/, "Workflow Runs"],
  [/^\/api\/workflows\/runs/, "Workflow Runs"],
  [/^\/api\/workflows/, "Workflows"],
  [/^\/api\/channels/, "Channels"],
  [/^\/api\/users/, "Users"],
  [/^\/api\/me\//, "Users"],
  [/^\/api\/realms/, "Realms"],
  [/^\/api\/models/, "Models"],
  [/^\/api\/skills/, "Skills"],
  [/^\/api\/org\/skills/, "Skills"],
  [/^\/api\/policies/, "Governance"],
  [/^\/api\/governance/, "Governance"],
  [/^\/api\/tool-approvals/, "Governance"],
  [/^\/api\/knowledge/, "Knowledge"],
  [/^\/api\/server/, "Server"],
  [/^\/api\/settings/, "Server"],
  [/^\/api\/network/, "Network"],
  [/^\/api\/graph/, "Network"],
  [/^\/api\/map/, "Network"],
  [/^\/api\/stats/, "Stats"],
  [/^\/api\/chat/, "Chat"],
  [/^\/api\/api-keys/, "API Keys"],
  [/^\/api\/invitations/, "Users"],
  [/^\/api\/bridges/, "Channels"],
];

// ─── helpers ────────────────────────────────────────────────────────────────

function findRouteFiles(dir: string): string[] {
  return execSync(`find "${dir}" -name "route.ts" | sort`)
    .toString()
    .trim()
    .split("\n")
    .filter(Boolean);
}

function fileToApiPath(filePath: string): string {
  const rel = path.relative(API_DIR, filePath);
  // strip trailing /route.ts
  const withoutFilename = rel.replace(/\/route\.ts$/, "");
  return "/api/" + withoutFilename;
}

function extractExportedMethods(src: string): string[] {
  const methods: string[] = [];
  for (const m of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
    // export async function GET / export function GET / export { GET }
    if (
      new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\b`).test(src) ||
      new RegExp(`export\\s+\\{[^}]*\\b${m}\\b`).test(src) ||
      new RegExp(`export\\s+const\\s+${m}\\s*=`).test(src)
    ) {
      methods.push(m);
    }
  }
  return methods;
}

function isPublicRoute(src: string, apiPath: string): boolean {
  // Explicitly known public paths
  const knownPublic = [
    "/api/health",
    "/api/setup/status",
    "/api/about",
    "/api/invitations/[token]",
  ];
  if (knownPublic.includes(apiPath)) return true;

  // No auth-related imports → likely public
  return !AUTH_IMPORTS.some((sym) => src.includes(sym));
}

interface OpenApiBlock {
  path?: string;
  summary?: string;
  tags?: string[];
}

function parseOpenApiBlock(src: string): OpenApiBlock {
  const match = src.match(/@openapi\s*([\s\S]*?)(?=\*\/|\* @)/);
  if (!match) return {};

  const block = match[1];
  const result: OpenApiBlock = {};

  // path line: /api/foo/bar:
  const pathMatch = block.match(/^\s*\*?\s*(\/api\/[^\s:]+)\s*:/m);
  if (pathMatch) result.path = pathMatch[1];

  // summary:
  const summaryMatch = block.match(/summary:\s*(.+)/);
  if (summaryMatch) result.summary = summaryMatch[1].trim().replace(/\.$/, "");

  // tags: [Foo, Bar]  or  tags:\n  - Foo
  const tagsInline = block.match(/tags:\s*\[([^\]]+)\]/);
  if (tagsInline) {
    result.tags = tagsInline[1].split(",").map((t) => t.trim());
  } else {
    const tagsList = [...block.matchAll(/- (\w[\w\s]+)/g)].map((m) =>
      m[1].trim()
    );
    if (tagsList.length) result.tags = tagsList;
  }

  return result;
}

function deriveGroup(apiPath: string, openApiTags: string[] = []): string {
  if (openApiTags.length) {
    // Normalise tag → group
    const tag = openApiTags[0];
    // Direct match to known groups
    const known = [
      "System",
      "Agents",
      "Registrations",
      "Intents",
      "Workflows",
      "Workflow Runs",
      "Workflow Approvals",
      "Channels",
      "Users",
      "Realms",
      "Models",
      "Skills",
      "Governance",
      "Knowledge",
      "Server",
      "Network",
      "Stats",
      "Chat",
      "API Keys",
    ];
    const found = known.find(
      (g) => g.toLowerCase() === tag.toLowerCase().replace(/-/g, " ")
    );
    if (found) return found;
  }

  for (const [regex, group] of PATH_GROUP_MAP) {
    if (regex.test(apiPath)) return group;
  }
  return "Other";
}

function deriveSubgroup(apiPath: string, group: string): string | undefined {
  const subgroupRules: Array<[RegExp, string]> = [
    [/^\/api\/agent(s)?\/\[did\]\/peers/, "Agent peers"],
    [/^\/api\/agent(s)?\/\[did\]\//, "Agent details"],
    [/^\/api\/workflows\/\[id\]\//, "Workflow details"],
    [/^\/api\/workflows\/templates/, "Templates"],
    [/^\/api\/channels\/\[id\]\/messages/, "Messages"],
    [/^\/api\/channels\/\[id\]\/threads/, "Threads"],
    [/^\/api\/channels\/\[id\]\/bridges/, "Bridges"],
    [/^\/api\/channels\/\[id\]\//, "Channel details"],
    [/^\/api\/users\/\[did\]\/grants/, "User grants"],
    [/^\/api\/users\/\[did\]\//, "User details"],
    [/^\/api\/users\/invite/, "Invitations"],
    [/^\/api\/users\/unclaimed/, "Unclaimed users"],
    [/^\/api\/me\//, "User details"],
    [/^\/api\/realms\/\[id\]\/skills/, "Realm skills"],
    [/^\/api\/realms\/\[id\]\/credentials/, "Credentials"],
    [
      /^\/api\/realms\/\[id\]\/(agents|users|default|models|social-media)/,
      "Realm members",
    ],
    [/^\/api\/realms\/\[id\]\//, "Realm details"],
    [/^\/api\/models\/\[id\]\//, "Model details"],
    [/^\/api\/org\/skills/, "Org skills"],
    [/^\/api\/skills\/library/, "Library"],
    [/^\/api\/governance\/audit/, "Audit log"],
    [/^\/api\/knowledge\/files/, "Files"],
    [/^\/api\/server\/smtp/, "SMTP"],
    [/^\/api\/server\/entra/, "Entra ID"],
    [/^\/api\/settings\/storage/, "Storage"],
    [/^\/api\/settings\/docling/, "Docling"],
  ];

  for (const [regex, sub] of subgroupRules) {
    if (regex.test(apiPath)) return sub;
  }
  return undefined;
}

function deriveDescription(
  apiPath: string,
  methods: string[],
  openApiSummary?: string
): string {
  if (openApiSummary) return openApiSummary;

  // Generate a reasonable fallback from the path
  const parts = apiPath.replace("/api/", "").split("/");
  const resource = parts[parts.length - 1].replace(/\[.*?\]/g, "").trim();
  const parent = parts[parts.length - 2]?.replace(/\[.*?\]/g, "").trim() ?? "";

  const label = resource || parent || parts[0];
  const humanLabel = label.replace(/-/g, " ");

  const hasGet = methods.includes("GET");
  const hasPost = methods.includes("POST");
  const hasDelete = methods.includes("DELETE");
  const hasMutate =
    methods.includes("PATCH") || methods.includes("PUT") || hasPost;

  if (apiPath.endsWith("/[id]") || apiPath.endsWith("/[did]")) {
    const ops = [
      hasGet ? "Get" : "",
      hasMutate && !hasPost ? "update" : "",
      hasDelete ? "delete" : "",
    ]
      .filter(Boolean)
      .join(", ");
    return ops
      ? `${ops} a ${humanLabel || "resource"}`
      : `Manage ${humanLabel || "resource"}`;
  }

  if (hasGet && hasPost) return `List or create ${humanLabel}`;
  if (hasGet) return `List ${humanLabel}`;
  if (hasPost) return `Create ${humanLabel}`;
  if (hasMutate) return `Update ${humanLabel}`;
  return `${humanLabel.charAt(0).toUpperCase() + humanLabel.slice(1)}`;
}

// ─── normalise path: filesystem uses /agent/ but registry uses /agents/ ────
function normaliseApiPath(p: string): string {
  // /api/agent/[did]/... → /api/agents/[did]/...
  return p.replace(/^\/api\/agent\//, "/api/agents/");
}

// ─── group ordering ─────────────────────────────────────────────────────────
const GROUP_ORDER = [
  "System",
  "Agents",
  "Registrations",
  "Intents",
  "Workflows",
  "Workflow Runs",
  "Workflow Approvals",
  "Channels",
  "Users",
  "Realms",
  "Models",
  "Skills",
  "Governance",
  "Knowledge",
  "Server",
  "Network",
  "Stats",
  "Chat",
  "API Keys",
  "Other",
];

// ─── main ───────────────────────────────────────────────────────────────────

interface RouteEntry {
  path: string;
  methods: string[];
  group: string;
  subgroup?: string;
  description: string;
  isPublic?: boolean;
}

function main() {
  const files = findRouteFiles(API_DIR);
  const entries: RouteEntry[] = [];

  for (const file of files) {
    const rawPath = fileToApiPath(file);

    if (SKIP_PATHS.has(rawPath)) continue;

    const src = fs.readFileSync(file, "utf-8");
    const methods = extractExportedMethods(src);
    if (!methods.length) continue;

    const apiPath = normaliseApiPath(rawPath);
    const openApi = parseOpenApiBlock(src);
    const group = deriveGroup(apiPath, openApi.tags);
    const subgroup = deriveSubgroup(apiPath, group);
    const description = deriveDescription(apiPath, methods, openApi.summary);
    const pub = isPublicRoute(src, apiPath);

    const entry: RouteEntry = { path: apiPath, methods, group, description };
    if (subgroup) entry.subgroup = subgroup;
    if (pub) entry.isPublic = true;

    entries.push(entry);
  }

  // Sort by group order, then by path
  entries.sort((a, b) => {
    const ga = GROUP_ORDER.indexOf(a.group);
    const gb = GROUP_ORDER.indexOf(b.group);
    if (ga !== gb) return ga - gb;
    return a.path.localeCompare(b.path);
  });

  // ── build output ──────────────────────────────────────────────────────────
  const lines: string[] = [
    "/**",
    " * Canonical registry of all API routes exposed by the control plane.",
    " *",
    " * This file is the single source of truth for:",
    " *   - The route permission selector UI (API key creation modal)",
    " *   - The Swagger coverage check script (scripts/check-api-coverage.ts)",
    " *",
    " * AUTO-GENERATED by scripts/generate-route-registry.ts",
    " * Do not edit by hand — run `pnpm tsx scripts/generate-route-registry.ts` to regenerate.",
    " * When you add a new route, also add an entry here.",
    " */",
    "",
    "export interface RouteEntry {",
    '  /** Next.js-style path, e.g. "/api/agents/[did]" */',
    "  path: string;",
    "  /** Supported HTTP methods */",
    "  methods: string[];",
    "  /** Top-level group shown in the permission tree */",
    "  group: string;",
    "  /** Optional sub-group for nested display */",
    "  subgroup?: string;",
    "  /** Short description displayed in the UI and Swagger */",
    "  description: string;",
    "  /** If true, the route is accessible without any authentication */",
    "  isPublic?: boolean;",
    "}",
    "",
    "export const ROUTE_REGISTRY: RouteEntry[] = [",
  ];

  let currentGroup = "";
  for (const e of entries) {
    if (e.group !== currentGroup) {
      currentGroup = e.group;
      const banner = `  // ── ${currentGroup} `;
      lines.push("");
      lines.push(banner + "─".repeat(Math.max(0, 76 - banner.length)));
    }
    const fields: string[] = [
      `    path: "${e.path}"`,
      `    methods: [${e.methods.map((m) => `"${m}"`).join(", ")}]`,
      `    group: "${e.group}"`,
    ];
    if (e.subgroup) fields.push(`    subgroup: "${e.subgroup}"`);
    fields.push(`    description: "${e.description}"`);
    if (e.isPublic) fields.push(`    isPublic: true`);

    lines.push("  {");
    lines.push(fields.join(",\n") + ",");
    lines.push("  },");
  }

  lines.push("];", "");
  lines.push(
    "/** Convenience helper: get unique group names in the order they appear */",
    "export function getRouteGroups(): string[] {",
    "  return [",
    "    ...new Set(ROUTE_REGISTRY.filter((r) => !r.isPublic).map((r) => r.group)),",
    "  ];",
    "}",
    "",
    "/** Get all non-public routes for a given group */",
    "export function getRoutesByGroup(group: string): RouteEntry[] {",
    "  return ROUTE_REGISTRY.filter((r) => r.group === group && !r.isPublic);",
    "}",
    ""
  );

  const output = lines.join("\n");

  if (DRY_RUN) {
    console.log(output);
    console.log(`\n[dry-run] Would write ${entries.length} entries to ${OUTPUT}`);
  } else {
    fs.writeFileSync(OUTPUT, output, "utf-8");
    console.log(`✓ Written ${entries.length} entries to ${OUTPUT}`);
  }
}

main();
