import { initClient, type InitClientReturn } from "@ts-rest/core";
import { appContract } from "@/lib/contracts";
import { ApiError } from "../base";

/** Shared client options — relative baseUrl keeps calls same-origin in the browser. */
const clientOptions = {
  baseUrl: "",
  baseHeaders: {} as Record<string, string>,
};

/**
 * Aggregate ts-rest client covering **every** domain contract.
 *
 * `initClient(appContract, …)` infers a fully typed method for each route from
 * the same contracts the server implements, so request bodies and return
 * values can never drift from the API. Access is namespaced by domain:
 *
 * ```ts
 * const res = await apiClient.workflows.getOne({ params: { id } });
 * const { agents } = unwrap(await apiClient.agents.list({ query: {} }));
 * ```
 *
 * Each call resolves to a non-throwing `{ status, body }` union — pass it
 * through {@link unwrap} for `BaseApi`-style throw-on-error behaviour.
 */
export const apiClient = initClient(appContract, clientOptions);

export type ApiClient = InitClientReturn<
  typeof appContract,
  typeof clientOptions
>;

/** ts-rest responses are a `{ status, body }` union keyed by status code. */
type TsRestResult = { status: number; body: unknown };

/**
 * Bridge ts-rest's non-throwing `{ status, body }` result to the rest of the
 * codebase, which expects `BaseApi`-style behaviour: return the body on a 2xx,
 * throw `ApiError` otherwise. This lets contract-backed methods be dropped into
 * the existing API client classes without changing any callers.
 */
export function unwrap<R extends TsRestResult>(
  result: R
): Extract<R, { status: 200 | 201 | 204 }>["body"] {
  if (result.status >= 200 && result.status < 300) {
    return result.body as Extract<R, { status: 200 | 201 | 204 }>["body"];
  }
  const body = (result.body ?? {}) as {
    error?: string;
    code?: string;
    details?: Record<string, unknown>;
  };
  throw new ApiError(
    result.status,
    body.code ?? "UNKNOWN_ERROR",
    body.error ?? "Request failed",
    body.details
  );
}
