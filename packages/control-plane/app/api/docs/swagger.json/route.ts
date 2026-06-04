import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { glob } from "fs/promises";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";

/**
 * @openapi
 * /api/docs/swagger.json:
 *   get:
 *     summary: OpenAPI specification
 *     description: Returns the full OpenAPI 3.0 specification for the VaultysClaw API. Admin only.
 *     tags: [Documentation]
 *     security:
 *       - sessionCookie: []
 *     responses:
 *       200:
 *         description: OpenAPI 3.0 JSON specification
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  // Dynamic import to avoid bundling swagger-jsdoc in the client bundle
  const swaggerJsdoc = (await import("swagger-jsdoc")).default;

  const apiDir = path.join(process.cwd(), "app", "api");

  // Collect all route.ts files
  const files: string[] = [];
  for await (const f of glob(`${apiDir}/**/route.ts`)) {
    files.push(f);
  }
  // Also include lib files that may have inline schemas
  const libDir = path.join(process.cwd(), "lib");
  for await (const f of glob(`${libDir}/api-types.ts`)) {
    files.push(f);
  }

  const options = {
    definition: {
      openapi: "3.0.0",
      info: {
        title: "VaultysClaw API",
        version: "1.0.0",
        description:
          "REST API for the VaultysClaw control plane. Authenticate with a session cookie or an `X-API-Key` header.",
        contact: {
          name: "VaultysClaw",
          url: "https://github.com/vaultys/VaultysClaw",
        },
      },
      servers: [{ url: "/", description: "Current server" }],
      components: {
        securitySchemes: {
          sessionCookie: {
            type: "apiKey",
            in: "cookie",
            name: "next-auth.session-token",
          },
          apiKey: {
            type: "apiKey",
            in: "header",
            name: "X-API-Key",
          },
        },
        responses: {
          Unauthorized: {
            description: "Not authenticated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { error: { type: "string" } },
                },
              },
            },
          },
          Forbidden: {
            description: "Insufficient permissions",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { error: { type: "string" } },
                },
              },
            },
          },
          NotFound: {
            description: "Resource not found",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { error: { type: "string" } },
                },
              },
            },
          },
          BadRequest: {
            description: "Invalid request body or parameters",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { error: { type: "string" } },
                },
              },
            },
          },
        },
        schemas: {
          ApiKey: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              keyPrefix: {
                type: "string",
                description: "Displayable prefix, never the full key",
              },
              allowedRoutes: { type: "array", items: { type: "string" } },
              realmId: { type: "string", nullable: true },
              isRealmAdmin: { type: "boolean" },
              createdBy: { type: "string" },
              createdAt: { type: "integer" },
              lastUsedAt: { type: "integer", nullable: true },
              expiresAt: { type: "integer", nullable: true },
              isActive: { type: "boolean" },
            },
          },
          ApiKeyCreateRequest: {
            type: "object",
            required: ["name", "allowedRoutes"],
            properties: {
              name: { type: "string" },
              allowedRoutes: { type: "array", items: { type: "string" } },
              realmId: { type: "string", nullable: true },
              isRealmAdmin: { type: "boolean", default: false },
              expiresAt: { type: "integer", nullable: true },
            },
          },
          ApiKeyUpdateRequest: {
            type: "object",
            properties: {
              name: { type: "string" },
              allowedRoutes: { type: "array", items: { type: "string" } },
              realmId: { type: "string", nullable: true },
              isRealmAdmin: { type: "boolean" },
              expiresAt: { type: "integer", nullable: true },
              isActive: { type: "boolean" },
            },
          },
          ApiKeyCreatedResponse: {
            type: "object",
            properties: {
              apiKey: { $ref: "#/components/schemas/ApiKey" },
              key: {
                type: "string",
                description: "Full raw key — shown exactly once",
              },
            },
          },
        },
      },
      security: [{ sessionCookie: [] }, { apiKey: [] }],
    },
    apis: files,
  };

  const spec = swaggerJsdoc(options);
  return NextResponse.json(spec);
}
