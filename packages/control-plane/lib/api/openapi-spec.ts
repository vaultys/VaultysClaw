import { zodToJsonSchema } from "zod-to-json-schema";
import { appContract } from "@/lib/contracts";

/**
 * Builds an OpenAPI 3.0 document straight from the ts-rest `appContract`.
 *
 * Replaces the old swagger-jsdoc pipeline (which parsed `@openapi` JSDoc
 * comments in route files): the contract — method, path, path params, query,
 * body and per-status response schemas, all declared with zod — is now the
 * single source of truth. Pure, runs in the browser, fed directly to
 * SwaggerUI on the /docs page.
 */

type JsonSchema = Record<string, unknown>;

interface AppRouteLike {
  method: string;
  path: string;
  summary?: string;
  description?: string;
  pathParams?: unknown;
  query?: unknown;
  body?: unknown;
  responses?: Record<string, unknown>;
}

function isRoute(v: unknown): v is AppRouteLike {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as { method?: unknown }).method === "string" &&
    typeof (v as { path?: unknown }).path === "string"
  );
}

/** zod schemas expose `safeParse` + `_def`; `c.type<T>()` / `c.noBody()` do not. */
function isZodSchema(v: unknown): boolean {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as { safeParse?: unknown }).safeParse === "function" &&
    "_def" in (v as object)
  );
}

function toSchema(v: unknown): JsonSchema | undefined {
  if (!isZodSchema(v)) return undefined;
  return zodToJsonSchema(v as never, {
    target: "openApi3",
    $refStrategy: "none",
  }) as JsonSchema;
}

/** ts-rest `:param` → OpenAPI `{param}`. */
function toOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function prettyGroup(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/** Split a zod object schema into individual OpenAPI parameter objects. */
function objectToParams(
  schema: unknown,
  location: "path" | "query"
): JsonSchema[] {
  const json = toSchema(schema);
  const props = (json?.properties ?? {}) as Record<string, JsonSchema>;
  const required = new Set((json?.required as string[] | undefined) ?? []);
  return Object.entries(props).map(([name, propSchema]) => ({
    name,
    in: location,
    required: location === "path" ? true : required.has(name),
    schema: propSchema,
  }));
}

const STATUS_TEXT: Record<string, string> = {
  "200": "OK",
  "201": "Created",
  "204": "No Content",
  "400": "Bad request",
  "401": "Not authenticated",
  "403": "Insufficient permissions",
  "404": "Resource not found",
  "500": "Internal server error",
  "503": "Service unavailable",
};

function buildResponses(route: AppRouteLike): JsonSchema {
  const responses: JsonSchema = {};
  for (const [status, body] of Object.entries(route.responses ?? {})) {
    const schema = toSchema(body);
    responses[status] = {
      description: STATUS_TEXT[status] ?? "Response",
      ...(schema
        ? { content: { "application/json": { schema } } }
        : {}),
    };
  }
  if (Object.keys(responses).length === 0) responses["200"] = { description: "OK" };
  return responses;
}

function buildOperation(route: AppRouteLike, tag: string): JsonSchema {
  const parameters = [
    ...objectToParams(route.pathParams, "path"),
    ...objectToParams(route.query, "query"),
  ];

  const operation: JsonSchema = {
    tags: [tag],
    summary: route.summary,
    description: route.description,
    responses: buildResponses(route),
  };
  if (parameters.length > 0) operation.parameters = parameters;

  const bodySchema = toSchema(route.body);
  if (bodySchema && route.method !== "GET") {
    operation.requestBody = {
      content: { "application/json": { schema: bodySchema } },
    };
  }
  return operation;
}

function collect(
  node: unknown,
  tag: string,
  paths: Record<string, JsonSchema>
): void {
  if (!node || typeof node !== "object") return;
  if (isRoute(node)) {
    const openApiPath = toOpenApiPath(node.path);
    const item = (paths[openApiPath] ??= {});
    item[node.method.toLowerCase()] = buildOperation(node, tag);
    return;
  }
  for (const value of Object.values(node)) collect(value, tag, paths);
}

export function buildOpenApiSpec(): Record<string, unknown> {
  const paths: Record<string, JsonSchema> = {};
  const tags: { name: string }[] = [];

  for (const [key, router] of Object.entries(appContract)) {
    if (!hasRoutes(router)) continue;
    const tag = prettyGroup(key);
    collect(router, tag, paths);
    tags.push({ name: tag });
  }

  return {
    openapi: "3.0.0",
    info: {
      title: "VaultysClaw API",
      version: "1.0.0",
      description:
        "REST API for the VaultysClaw control plane, generated from the ts-rest contracts. Authenticate with a session cookie or an `X-API-Key` header.",
      contact: {
        name: "VaultysClaw",
        url: "https://github.com/vaultys/VaultysClaw",
      },
    },
    servers: [{ url: "/", description: "Current server" }],
    tags: tags.sort((a, b) => a.name.localeCompare(b.name)),
    components: {
      securitySchemes: {
        sessionCookie: {
          type: "apiKey",
          in: "cookie",
          name: "next-auth.session-token",
        },
        apiKey: { type: "apiKey", in: "header", name: "X-API-Key" },
      },
    },
    security: [{ sessionCookie: [] }, { apiKey: [] }],
    paths,
  };
}

function hasRoutes(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  if (isRoute(node)) return true;
  return Object.values(node).some(hasRoutes);
}
