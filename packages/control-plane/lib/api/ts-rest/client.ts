import { initClient, type InitClientReturn } from "@ts-rest/core";
import { agentDetailContract } from "@/lib/contracts";
import { ApiError } from "../base";

/**
 * ts-rest client bound to the agent contract.
 *
 * `initClient` infers fully typed methods from the same contract the server
 * implements, so request bodies and return values can never drift from the
 * API. A relative `baseUrl` keeps calls same-origin in the browser.
 */
export const agentContractClient = initClient(agentDetailContract, {
  baseUrl: "",
  baseHeaders: {},
});

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

export type AgentContractClient = InitClientReturn<
  typeof agentDetailContract,
  { baseUrl: string; baseHeaders: Record<string, string> }
>;
