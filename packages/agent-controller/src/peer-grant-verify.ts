/**
 * Re-export verifyPeerGrant from the sdk package.
 * This file is kept for backward compatibility with any code that imported
 * verifyPeerGrant directly from agent-controller.
 */
export { verifyPeerGrant } from "@vaultysclaw/sdk";
export type { PeerGrantPayload } from "@vaultysclaw/sdk";
