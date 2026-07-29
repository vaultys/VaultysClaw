/**
 * Re-export verifyIntentMessage from the sdk package.
 * This file is kept for backward compatibility with any code that imported
 * verifyIntentMessage directly from agent-controller.
 */
export { verifyIntentMessage } from "@vaultysclaw/sdk";
export type { IntentSigningBody } from "@vaultysclaw/sdk";
