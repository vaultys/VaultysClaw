/**
 * P2P authentication for the agent-controller web dashboard.
 *
 * Uses the same Challenger protocol as the control-plane (PeerJS WebRTC relay).
 * An authenticated user is only permitted access if they have at least one valid
 * delegation stored locally for this agent — enabling offline verification when
 * the control plane is unavailable.
 *
 * WebRTC globals are polyfilled at module load time via @roamhq/wrtc.
 */

// Polyfill WebRTC for Node.js (required by PeerjsChannel)
import * as wrtc from "@roamhq/wrtc";
(global as Record<string, unknown>).RTCPeerConnection = wrtc.RTCPeerConnection;
(global as Record<string, unknown>).RTCSessionDescription =
  wrtc.RTCSessionDescription;
(global as Record<string, unknown>).RTCIceCandidate = wrtc.RTCIceCandidate;
(global as Record<string, unknown>).getUserMedia = wrtc.getUserMedia;

import { Challenger, VaultysId, crypto } from "@vaultys/id";
import { getAllDelegations } from "../db";

const Buffer = crypto.Buffer;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SessionStatus =
  | "pending"
  | "success"
  | "unauthorized"
  | "failed"
  | "expired";

export interface AuthSession {
  sessionId: string;
  status: SessionStatus;
  /** DID of the authenticated user (set when status === "success") */
  did?: string;
  connectionString: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// In-memory session store (sessionId → AuthSession)
// ---------------------------------------------------------------------------

const sessions = new Map<string, AuthSession>();

// GC: expire pending sessions after 90s; keep success/failed for 30 min
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    const maxAge = session.status === "pending" ? 90_000 : 30 * 60_000;
    if (now - session.createdAt > maxAge) sessions.delete(id);
  }
}, 2 * 60_000).unref();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const verifyProtocol = (challenger: Challenger): boolean => {
  const { protocol, service } = challenger.getContext();
  return protocol === "p2p" && (service === "register" || service === "auth");
};

/**
 * Check if the given DID is authorised to access this agent's dashboard.
 * A DID is authorised when it has at least one valid (non-expired) delegation
 * for this specific agent DID (or a wildcard "*" delegation).
 * This check uses only the locally-stored delegation table — no control-plane
 * connectivity required.
 */
function isDIDAuthorized(did: string, agentDid: string): boolean {
  const now = new Date();
  for (const d of getAllDelegations()) {
    if (d.user_did !== did) continue;
    if (d.expires_at && new Date(d.expires_at) < now) continue;
    if (d.agent_did === agentDid || d.agent_did === "*") return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start a new P2P authentication session for the web dashboard.
 *
 * Creates a PeerjsChannel as initiator and runs the full Challenger exchange
 * in the background. The browser only needs to display the returned
 * connectionString as a QR code and poll getSessionStatus(sessionId).
 *
 * QR URL format (same as control-plane):
 *   https://wallet.vaultys.net/#<connectionString>&protocol=p2p&service=auth&did=<agentDid>
 *
 * @param agentVaultysId  The agent's own VaultysId (used as the responder identity)
 * @param agentDid        The agent's stable DID string (for delegation checks)
 * @param peerjsServer    Optional override for the PeerJS relay server URL
 */
export async function startP2PAuthSession(
  agentVaultysId: VaultysId,
  peerjsServer?: string | null
): Promise<{ connectionString: string; sessionId: string }> {
  const { PeerjsChannel } = await import("@vaultys/channel-peerjs");

  const sessionId = crypto.randomBytes(16).toString("hex");
  // Use a fresh random key per session (same approach as control-plane's cert.key)
  const channelKey = crypto.randomBytes(32).toString("hex");

  // PeerjsChannel(key, role)
  // The peerjsServer option is reserved for future use once the PeerjsChannel
  // API exposes a server configuration parameter.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _peerjsServer = peerjsServer; // stored for future use
  const channel = new PeerjsChannel();
  const connectionString = channel.getConnectionString();

  const session: AuthSession = {
    sessionId,
    status: "pending",
    connectionString,
    createdAt: Date.now(),
  };
  sessions.set(sessionId, session);

  // Run Challenger exchange in the background — returns immediately
  (async () => {
    console.log(
      `[P2P auth] session ${sessionId.slice(0, 8)} started with ${agentVaultysId.did}, waiting for wallet...`
    );
    try {
      await channel.start();
      console.log(`[P2P auth] wallet connected`);

      const challenger = new Challenger(agentVaultysId.toVersion(1));
      challenger.version = 1;

      for (let round = 0; round < 4; round++) {
        const walletCert = await channel.receive();

        try {
          await challenger.update(walletCert);
        } catch (err) {
          console.error(
            `[P2P auth] round ${round}: challenger.update() failed:`,
            err
          );
          session.status = "failed";
          return;
        }

        if (challenger.hasFailed()) {
          console.error(`[P2P auth] round ${round}: challenger.hasFailed()`);
          session.status = "failed";
          return;
        }

        if (!verifyProtocol(challenger)) {
          console.error(
            `[P2P auth] round ${round}: protocol verification failed`
          );
          session.status = "failed";
          return;
        }

        if (challenger.isComplete()) {
          const contact = challenger.getContactId();
          const did = contact.toVersion(1).did;
          console.log(`[P2P auth] Challenger complete — wallet DID: ${did}`);

          if (!isDIDAuthorized(did, agentVaultysId.did)) {
            console.warn(
              `[P2P auth] DID ${did} has no valid delegation for agent ${agentVaultysId.did}`
            );
            session.status = "unauthorized";
            return;
          }

          session.status = "success";
          session.did = did;
          console.log(
            `[P2P auth] session ${sessionId.slice(0, 8)} authorised for ${did}`
          );
          return;
        }

        // Protocol not yet complete — send server certificate and wait for next round
        const serverCert = challenger.getCertificate();
        await channel.send(serverCert);
      }

      // Max rounds reached without completion
      if (session.status === "pending") {
        session.status = "failed";
      }
    } catch (err) {
      console.error("[P2P auth] session error:", err);
      if (session.status === "pending") session.status = "failed";
    } finally {
      await channel.close().catch(() => {});
    }
  })();

  return { connectionString, sessionId };
}

/** Get the current state of an auth session (for polling). */
export function getSessionStatus(sessionId: string): AuthSession | null {
  return sessions.get(sessionId) ?? null;
}

/** Remove a session from the store (logout). */
export function invalidateAuthSession(sessionId: string): void {
  sessions.delete(sessionId);
}
