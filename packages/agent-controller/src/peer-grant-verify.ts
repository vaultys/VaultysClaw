/**
 * Re-export verifyPeerGrant from the agent-runtime package.
 * This file is kept for backward compatibility with any code that imported
 * verifyPeerGrant directly from agent-controller.
 */
export { verifyPeerGrant } from "@vaultysclaw/agent-runtime";
export type { PeerGrantPayload } from "@vaultysclaw/agent-runtime";
