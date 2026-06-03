/**
 * VaultysId challenge-response authentication handler
 * Simplified from the bastion ServerChannel — no organizations, memberships, or devices.
 * Certificates are persisted in SQLite instead of the DAO layer.
 *
 * Protocol flow (over WebSocket):
 * 1. Server creates Challenger, sends initial certificate to agent
 * 2. Agent creates its own Challenger, calls init(cert), sends back its certificate
 * 3. Server calls init(stored_cert) then update(agent_cert), sends updated cert
 * 4. Steps repeat until challenger.isComplete() or challenger.hasFailed()
 * 5. On completion, agent DID is extracted and stored in the agents table
 */

import { Challenger, VaultysId, crypto } from "@vaultys/id";
import { verifyProtocol } from "@vaultysclaw/shared";
import pino from "pino";
import type { ResourceLimits } from "@vaultysclaw/shared";
import { ActivityLogDAO, AuthSessionDAO, SettingsDAO } from "@/db";

/** Extra governance data embedded alongside capabilities in the cert metadata. */
export interface PolicyMeta {
  resourceLimits?: ResourceLimits | null;
  policyId?: string | null;
  policyExpiresAt?: string | null;
}

const logger = pino();
const Buffer = crypto.Buffer;

export interface AuthResult {
  done: boolean;
  success?: boolean;
  error?: string;
  /** base64-encoded certificate data to send back to agent */
  responseData?: string;
  /** Populated on success */
  agentDid?: string;
  agentName?: string;
  capabilities?: string[];
  certificateData?: string;
}

/**
 * Get the server's VaultysId from stored secret
 */
async function getServerVaultysId(): Promise<VaultysId> {
  const serverSecret = await SettingsDAO.get("serverSecret");
  if (!serverSecret) {
    throw new Error("Server VaultysId secret not configured");
  }
  return VaultysId.fromSecret(serverSecret, "base64");
}

/**
 * Create a new authentication session.
 * The agent initiates the challenge — the server only responds.
 *
 * Returns the session ID (no initial data — wait for agent's first message).
 */
export async function createAuthSession(): Promise<{ sessionId: string }> {
  const sessionId = crypto.randomBytes(16).toString("hex");

  // Persist empty session — will be populated on first processChallenge call
  await AuthSessionDAO.create(sessionId, sessionId);

  logger.info({ sessionId }, "Auth session created");

  return { sessionId };
}

/**
 * Process a challenge message from the agent.
 *
 * @param sessionId   - the auth session ID
 * @param data        - base64-encoded certificate data from agent
 * @param agentName   - the name the agent reported
 * @param capabilities - the capabilities the agent reported
 * @param policyMeta  - optional governance metadata embedded alongside capabilities in the cert
 */
export async function processChallenge(
  sessionId: string,
  data: string,
  agentName: string = "unknown",
  capabilities: string[] = [],
  policyMeta?: PolicyMeta
): Promise<AuthResult> {
  const session = await AuthSessionDAO.findById(sessionId);
  if (!session) {
    return { done: true, success: false, error: "Session not found" };
  }

  const vid = await getServerVaultysId();

  // Reconstruct server Challenger
  const challenger = new Challenger(vid.toVersion(1));

  // If we have saved certificate data from a previous exchange, restore state
  if (session.certificateData) {
    try {
      await challenger.init(Buffer.from(session.certificateData, "base64"));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      await AuthSessionDAO.update(sessionId, { status: -2 });
      return { done: true, success: false, error: msg };
    }
  }

  // Feed agent's certificate data to the challenger.
  // On the first update we embed capabilities + governance metadata as native types —
  // the Challenger library serialises the object internally, so no manual JSON.stringify.
  try {
    const isFirstUpdate = !session.certificateData;
    let metadata: Record<string, unknown> | undefined;
    if (isFirstUpdate) {
      if (capabilities.length > 0 || policyMeta) {
        metadata = { capabilities };
        if (policyMeta?.resourceLimits != null)
          metadata.resourceLimits = policyMeta.resourceLimits;
        if (policyMeta?.policyId != null)
          metadata.policyId = policyMeta.policyId;
        if (policyMeta?.policyExpiresAt != null)
          metadata.policyExpiresAt = policyMeta.policyExpiresAt;
      }
    }
    // Cast to `any`: the library's type declaration is Record<string,string> but
    // the runtime implementation serialises the full object, so native values
    // (arrays, numbers, nested objects) are preserved correctly.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await challenger.update(Buffer.from(data, "base64"), metadata as any);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    await AuthSessionDAO.update(sessionId, { status: -2 });
    return { done: true, success: false, error: msg };
  }

  // Get the updated certificate
  const certificate = challenger.getCertificate();
  const certB64 = certificate.toString("base64");

  // Check for failure
  if (challenger.hasFailed()) {
    await AuthSessionDAO.update(sessionId, {
      certificateData: certB64,
      status: -2,
    });
    const err = challenger.challenge?.error ?? "Challenge failed";
    await ActivityLogDAO.log("auth_failed", undefined, agentName, err);
    return { done: true, success: false, error: err };
  }

  // Verify protocol hasn't been tampered with
  if (!verifyProtocol(challenger)) {
    await AuthSessionDAO.update(sessionId, {
      certificateData: certB64,
      status: -2,
    });
    return { done: true, success: false, error: "Protocol tampered" };
  }

  // If challenge is complete, authentication succeeded
  if (challenger.isComplete()) {
    const contactDid = challenger.getContactId().toVersion(1).did;
    if (!contactDid) {
      await AuthSessionDAO.update(sessionId, {
        certificateData: certB64,
        status: -2,
      });
      return {
        done: true,
        success: false,
        error: "No contact DID after completion",
      };
    }

    // Read capabilities + policy metadata from cert (pk2 = server-assigned).
    // Capabilities may be a native array (new certs) or a JSON string (legacy certs).
    const context = challenger.getContext();
    let certCapabilities = capabilities;
    try {
      const metaCaps = context.metadata?.pk2?.capabilities;
      if (Array.isArray(metaCaps)) certCapabilities = metaCaps;
      else if (typeof metaCaps === "string")
        certCapabilities = JSON.parse(metaCaps);
    } catch {
      // fallback to passed capabilities
    }

    // NOTE: Agent is NOT persisted here. The ws-server decides whether to
    // upsert based on the approval flow (known DID → auto-connect,
    // unknown DID → pending admin approval).

    await AuthSessionDAO.update(sessionId, {
      certificateData: certB64,
      status: 2,
      agentDid: contactDid,
    });

    logger.info(
      { sessionId, agentDid: contactDid },
      "Auth completed successfully"
    );

    await ActivityLogDAO.log(
      "agent_authenticated",
      contactDid,
      agentName,
      JSON.stringify({ capabilities: certCapabilities, sessionId })
    );

    return {
      done: true,
      success: true,
      responseData: certB64,
      agentDid: contactDid,
      agentName,
      capabilities: certCapabilities,
      certificateData: certB64,
    };
  }

  // Challenge still in progress — persist state and return next data
  await AuthSessionDAO.update(sessionId, {
    certificateData: certB64,
    status: challenger.state,
    agentDid: undefined,
  });

  logger.debug(
    { sessionId, state: challenger.state },
    "Auth challenge in progress"
  );

  return { done: false, responseData: certB64 };
}
