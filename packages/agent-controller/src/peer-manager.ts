/**
 * Re-export PeerManager from the agent-runtime package.
 * This file is kept for backward compatibility with any code that imported
 * PeerManager directly from agent-controller.
 */
export { PeerManager, peerIdForDid } from "@vaultysclaw/agent-runtime";
