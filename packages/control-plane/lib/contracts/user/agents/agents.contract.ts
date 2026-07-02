import { c } from "../../contract";

/**
 * User-facing agents API — scoped to the caller's own workspaces/agents.
 *
 * Intentionally empty for now: a temporary route lives at `app/api/(user)/agents`
 * while the user-scoped endpoints are being designed. Routes will be added here
 * with paths under `/api/agents` (the `(user)` route group is stripped from the
 * path). See `lib/contracts/admin/agents` for the admin counterpart.
 */
export const userAgentsContract = c.router({});
