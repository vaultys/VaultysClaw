import { initContract } from "@ts-rest/core";

/**
 * Single ts-rest contract instance shared by every domain contract.
 *
 * Lives in its own module (rather than `index.ts`) to avoid a circular import:
 * `index.ts` re-exports the domain contracts, which in turn need `c` — pulling
 * `c` from the barrel would create a temporal-dead-zone error at load time.
 *
 * A *contract* is the single source of truth for an endpoint: its method,
 * path, path params, query, body and per-status response shapes — all
 * described with zod. Both sides consume it:
 *
 *   - the server route handler (see `lib/api/ts-rest/next-route.ts`) validates
 *     incoming requests and is type-checked against the declared responses;
 *   - the typed client (see `lib/api/ts-rest/client.ts`) infers argument and
 *     return types directly from the same object.
 */
export const c = initContract();
