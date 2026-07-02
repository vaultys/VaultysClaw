import { NextRequest, NextResponse } from "next/server";
import {
  type AppRoute,
  type AppRouteMutation,
  type AppRouter,
  type ServerInferRequest,
  type ServerInferResponses,
  checkZodSchema,
  isZodType,
} from "@ts-rest/core";
import type { z } from "zod";
import { resolveApiError } from "@/lib/api/utils/api-utils";

/**
 * ts-rest → Next.js App Router adapter.
 *
 * `createNextRoute` turns a ts-rest contract (an `AppRouter`) plus a strongly
 * typed implementation into the `GET`/`POST`/`PATCH`/... handlers that a
 * `route.ts` file exports. It runs the request-validation and
 * response-shaping boilerplate that used to live in every handler:
 *
 *   1. await + decode Next's path params, validate against `pathParams`;
 *   2. parse the URL query and validate against `query`;
 *   3. read + validate the JSON body against `body` (mutations only);
 *   4. call the implementation, which returns a typed `{ status, body }`;
 *   5. serialize to `NextResponse` (handling 204/no-body), and convert any
 *      thrown error into a `500`.
 *
 * Validation failures short-circuit with a `400` carrying a `BAD_REQUEST`
 * code and zod issue details — matching the shape declared in
 * `commonErrorResponses`.
 *
 * The implementation is type-checked against the contract: its arguments are
 * inferred from the route's schemas (`ServerInferRequest`) and its return
 * value must be one of the declared responses (`ServerInferResponses`).
 *
 * The implementation is **partial**: a contract may span many paths (one
 * router for a whole domain), while Next's file-based routing has one
 * `route.ts` per path. Each file implements only the routes that live at its
 * path; `createNextRoute` wires up exactly those, keyed by HTTP method. Because
 * a single file's routes all share one path, their methods are unique — a
 * collision (two implemented routes with the same method) means the
 * implementation mixes paths and throws at module load.
 *
 * ```ts
 * // app/api/admin/agents/[did]/route.ts — only the :did-level routes
 * const handlers = createNextRoute(adminAgentsContract, {
 *   getAgent: async ({ params }) => ({ status: 200, body: … }),
 *   updateAgent: async ({ params, body }) => ({ status: 200, body: … }),
 *   deleteAgent: async ({ params }) => ({ status: 204, body: undefined }),
 * });
 * export const GET = handlers.GET!;
 * export const PATCH = handlers.PATCH!;
 * export const DELETE = handlers.DELETE!;
 * ```
 */

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Next App Router handler signature (params are async since Next 15). */
type NextRouteHandler = (
  request: NextRequest,
  context: { params: Promise<Record<string, string>> }
) => Promise<NextResponse>;

/** Implementation of a single contract route. */
export type RouteImplementation<T extends AppRoute> = (
  args: ServerInferRequest<T> & { request: NextRequest }
) => Promise<ServerInferResponses<T>>;

/**
 * Implementation map for a contract. Every key is **optional** — a route.ts
 * implements only the routes that live at its path (see `createNextRoute`).
 */
export type RouterImplementation<T extends AppRouter> = {
  [K in keyof T]?: T[K] extends AppRoute ? RouteImplementation<T[K]> : never;
};

function badRequest(error: z.ZodError): NextResponse {
  return NextResponse.json(
    {
      error: "Request validation failed",
      code: "BAD_REQUEST",
      details: { issues: error.issues },
    },
    { status: 400 }
  );
}

function makeHandler(
  route: AppRoute,
  impl: RouteImplementation<AppRoute>
): NextRouteHandler {
  return async (request, context) => {
    try {
      // 1. Path params — Next decodes nothing for us; match prior behaviour.
      const rawParams = (await context?.params) ?? {};
      const decodedParams: Record<string, string> = {};
      for (const [key, value] of Object.entries(rawParams)) {
        decodedParams[key] = decodeURIComponent(value);
      }
      let params: unknown = decodedParams;
      if (isZodType(route.pathParams)) {
        const parsed = checkZodSchema(decodedParams, route.pathParams);
        if (!parsed.success) return badRequest(parsed.error);
        params = parsed.data;
      }

      // 2. Query string.
      const url = new URL(request.url);
      const rawQuery = Object.fromEntries(url.searchParams.entries());
      let query: unknown = rawQuery;
      if (isZodType(route.query)) {
        const parsed = checkZodSchema(rawQuery, route.query);
        if (!parsed.success) return badRequest(parsed.error);
        query = parsed.data;
      }

      // 3. JSON body (mutations with a body schema only).
      let body: unknown = undefined;
      if (route.method !== "GET") {
        const mutation = route as AppRouteMutation;
        if (isZodType(mutation.body)) {
          let json: unknown = undefined;
          try {
            json = await request.json();
          } catch {
            // Leave undefined; let the schema decide whether that's valid.
          }
          const parsed = checkZodSchema(json, mutation.body);
          if (!parsed.success) return badRequest(parsed.error);
          body = parsed.data;
        }
      }

      // 4. Run the typed implementation.
      const result = await impl({
        params,
        query,
        body,
        headers: request.headers
          ? Object.fromEntries(request.headers.entries())
          : {},
        request,
      } as ServerInferRequest<AppRoute> & { request: NextRequest });

      // 5. Serialize. 204 (and any no-body response) carries no JSON.
      if (result.status === 204 || result.body === undefined) {
        return new NextResponse(null, { status: result.status });
      }
      return NextResponse.json(result.body, { status: result.status });
    } catch (error) {
      // Implementations (and helpers like getAuthContext) signal failures by
      // throwing APIException; anything else is masked as a 500.
      const { status, body, unexpected } = resolveApiError(error);
      if (unexpected) {
        console.error(`[${route.method} ${route.path}]`, error);
      }
      return NextResponse.json(body, { status });
    }
  };
}

export function createNextRoute<T extends AppRouter>(
  router: T,
  implementation: RouterImplementation<T>
): Partial<Record<HttpMethod, NextRouteHandler>> {
  const handlers: Partial<Record<HttpMethod, NextRouteHandler>> = {};

  // Iterate the *implementation* keys (a subset of the router) so a single
  // route.ts wires up only the routes that live at its path.
  for (const key of Object.keys(implementation)) {
    const route = router[key] as AppRoute | undefined;
    if (!route) {
      throw new Error(`createNextRoute: no contract route named "${key}"`);
    }
    if (handlers[route.method]) {
      throw new Error(
        `createNextRoute: duplicate ${route.method} handler ("${key}") — ` +
          `a single route.ts must implement routes for one path only`
      );
    }
    const impl = implementation[
      key as keyof RouterImplementation<T>
    ] as unknown as RouteImplementation<AppRoute>;
    handlers[route.method] = makeHandler(route, impl);
  }

  return handlers;
}
