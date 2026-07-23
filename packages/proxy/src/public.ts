/**
 * Public surface for consumers outside this package — currently
 * `@vaultysclaw/mcp-proxy`, which runs the exact same governance decision
 * (evaluateRequest/forwardRequest) over MCP instead of raw HTTP, but is its
 * own standalone agent (own VaultysId, own onboarding) rather than a mode of
 * this proxy's process.
 */
export { evaluateRequest, forwardRequest } from "./http-server.js";
export type { EvaluatedRequest, ForwardedResponse } from "./http-server.js";
export { matchRule, extractPrincipalId } from "./rules.js";
export { verifySelfSignedHeader, provisionIdentity, signRequest, hashBody } from "./identity.js";
export { LocalDb } from "./local-db.js";
