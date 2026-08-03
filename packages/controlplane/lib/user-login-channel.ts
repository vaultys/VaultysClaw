/**
 * VaultysId QR-code (P2P/WebRTC) login channel for human Principals.
 *
 * Ported from packages/control-plane's `UserServerChannel`, trimmed to only
 * the P2P wallet-pairing flow (the actual "scan this QR with your VaultysId
 * app" login) — the browser-extension "bastion" pairing and the older
 * WS-relay `handleRequest` flow are not reused here; they're a separate
 * feature, not the core login primitive docs/REBUILD_ARCHITECTURE.md §1
 * requires to stay unchanged.
 *
 * Register vs. login is decided by whether any human Principal exists yet —
 * the first successful handshake ever also runs the bootstrap-admin check
 * (lib/certificates.ts `ensureBootstrapAdmin`).
 */
import { Challenger, CryptoChannel, VaultysId, crypto } from "@vaultys/id";
import pino from "pino";
import { AuthCertificateDAO, PrincipalDAO, UserDAO } from "@/db";
import { ServerIdentityDAO } from "@/db/settings.dao";
import { ensureBootstrapAdmin } from "./certificates";
import type { AuthCertificate } from "@prisma/client";

const logger = pino({ name: "user-login-channel" });
const Buffer = crypto.Buffer;

function verifyProtocol(challenger: Challenger): boolean {
  const { protocol, service } = challenger.getContext();
  return protocol === "p2p" && (service === "register" || service === "auth");
}

// Mutable working copy of a cert during the challenger protocol.
type MutableCert = {
  id: string;
  key: string;
  register: number;
  data: string;
  status: number;
  metadata: string | null;
};

async function registerHuman(contact: VaultysId): Promise<boolean> {
  const did = contact.toVersion(1).did;
  const publicKey = Buffer.from(contact.id).toString("base64");
  await UserDAO.ensureExists(did, "Unnamed", null, publicKey);
  await ensureBootstrapAdmin(did);
  logger.info({ did }, "New human Principal registered via QR login");
  return true;
}

async function loginHuman(contact: VaultysId): Promise<boolean> {
  const did = contact.toVersion(1).did;
  const existing = await UserDAO.findByDid(did);
  if (!existing) {
    logger.warn({ did }, "Login attempt for unknown DID");
  }
  return existing !== null;
}

async function handleSuccess(cert: MutableCert, challenger: Challenger): Promise<boolean> {
  const contact = challenger.getContactId();
  const did = contact.toVersion(1).did;
  const meta = JSON.parse(cert.metadata ?? "{}") as Record<string, unknown>;

  const ok = cert.register ? await registerHuman(contact) : await loginHuman(contact);
  if (ok) {
    meta.did = did;
    cert.metadata = JSON.stringify(meta);
  }
  return ok;
}

export class UserLoginChannel {
  static async createRegistrationCertificate(): Promise<AuthCertificate> {
    const key = crypto.randomBytes(32).toString("hex");
    return AuthCertificateDAO.create({
      id: crypto.randomBytes(16).toString("hex"),
      key,
      registration: crypto.hash("sha256", Buffer.from(`vaultys-${key}-server`)).toString("hex"),
      connection: crypto.hash("sha256", Buffer.from(`connecting-${key}-vaultys`)).toString("hex"),
      register: 1,
      data: "",
    });
  }

  static async createConnectionCertificate(): Promise<AuthCertificate> {
    const key = crypto.randomBytes(32).toString("hex");
    return AuthCertificateDAO.create({
      id: crypto.randomBytes(16).toString("hex"),
      key,
      registration: crypto.hash("sha256", Buffer.from(`vaultys-${key}-server`)).toString("hex"),
      connection: crypto.hash("sha256", Buffer.from(`connecting-${key}-vaultys`)).toString("hex"),
      register: 0,
      data: "",
    });
  }

  /**
   * Opens a server-side PeerJS channel as initiator, runs the full Challenger
   * protocol when the wallet connects, then writes the result to the auth
   * certificate. Returns the PeerJS connection string embedded in the QR code.
   *
   * The API route returns immediately; the session runs in the background on
   * the Node.js event loop until the wallet connects or the channel closes.
   */
  static async startP2PSession(cert: AuthCertificate): Promise<string> {
    const { PeerjsChannel } = await import("@vaultys/channel-peerjs");

    const channel = new PeerjsChannel(cert.key, "initiator");
    const connectionString = channel.getConnectionString();

    void (async () => {
      const mutableCert: MutableCert = { ...cert };
      try {
        await channel.start(); // blocks until the wallet connects via the PeerJS relay
        const vid = await ServerIdentityDAO.getServerVaultysId();
        const challenger = new Challenger(vid);

        // Round-based exchange. Some wallet versions close the channel after a
        // single round (identity already proven at challenger.state === 1);
        // PeerJS doesn't signal that closure, so channel.receive() would hang
        // forever — race it against a short timeout and treat that specific
        // state as completion instead of a failure.
        for (let round = 0; round < 4; round++) {
          let walletCert: Uint8Array;
          try {
            walletCert = await (round === 0
              ? channel.receive()
              : Promise.race([
                  channel.receive(),
                  new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error("p2p-round-timeout")), 5_000)
                  ),
                ]));
          } catch (receiveErr) {
            const isTimeout = receiveErr instanceof Error && receiveErr.message === "p2p-round-timeout";
            if (isTimeout && challenger.state === 1 && verifyProtocol(challenger)) {
              const contactDid = challenger.getContactDid();
              const hisKeyRaw = (challenger as unknown as { hisKey: Buffer }).hisKey;
              if (contactDid && hisKeyRaw) {
                const contact = VaultysId.fromId(hisKeyRaw);
                const ok = await (mutableCert.register === 1 ? registerHuman(contact) : loginHuman(contact));
                mutableCert.metadata = JSON.stringify({ did: contactDid });
                await AuthCertificateDAO.update(cert.id, {
                  status: ok ? 2 : -2,
                  metadata: mutableCert.metadata,
                });
              } else {
                await AuthCertificateDAO.update(cert.id, { status: -2 });
              }
            } else {
              logger.warn({ err: receiveErr, round }, "P2P receive failed");
              await AuthCertificateDAO.update(cert.id, { status: -2 });
            }
            break;
          }

          await challenger.update(walletCert);
          mutableCert.data = challenger.getCertificate().toString("base64");
          mutableCert.status = challenger.state;

          if (challenger.hasFailed()) {
            await AuthCertificateDAO.update(cert.id, { status: -2, data: mutableCert.data });
            break;
          }
          if (!verifyProtocol(challenger)) {
            await AuthCertificateDAO.update(cert.id, { status: -2, data: mutableCert.data });
            break;
          }
          if (challenger.isComplete()) {
            const ok = await handleSuccess(mutableCert, challenger);
            await AuthCertificateDAO.update(cert.id, {
              status: ok ? 2 : -2,
              data: mutableCert.data,
              metadata: mutableCert.metadata ?? undefined,
            });
            break;
          }

          await channel.send(challenger.getCertificate());
        }
      } catch (err) {
        logger.error({ err }, "P2P login session error");
        await AuthCertificateDAO.update(cert.id, { status: -2 });
      } finally {
        await channel.close().catch(() => {});
      }
    })();

    return connectionString;
  }

  /**
   * Handles one round of the classic (non-WebRTC) Challenger protocol, relayed
   * over plain HTTP POSTs instead of a PeerJS data channel. This is what
   * powers "connect without the app" in dev mode
   * (docs/REBUILD_ARCHITECTURE.md §1 note: dev convenience, not a redesign of
   * the login primitive) — the browser generates its own software VaultysId
   * and runs the SRP itself, so no physical wallet or WebRTC/native bindings
   * are needed at all. `token` is the sha256("vaultys-{key}-server")
   * registration hash; `data` is base64 CryptoChannel-encrypted cert bytes.
   */
  static async handleRequest(token: string, data: string): Promise<Uint8Array> {
    if (!token) return new Uint8Array([0]);

    const cert = await AuthCertificateDAO.findByRegistration(token);
    if (!cert) return new Uint8Array([0]);

    const mutableCert: MutableCert = { ...cert };
    const uintkey = Buffer.from(cert.key, "hex");

    const vid = await ServerIdentityDAO.getServerVaultysId();
    const challenger = new Challenger(vid);

    if (cert.data) {
      try {
        await challenger.init(Buffer.from(cert.data, "base64"));
      } catch (err) {
        logger.warn({ err }, "Challenger.init failed");
        await AuthCertificateDAO.update(cert.id, { status: -2 });
        return new Uint8Array([0]);
      }
    }

    const decoded = CryptoChannel.decrypt(Buffer.from(data, "base64"), uintkey);

    try {
      await challenger.update(decoded);
    } catch (err) {
      logger.warn({ err }, "Challenger.update failed");
      await AuthCertificateDAO.update(cert.id, { status: -2 });
      return new Uint8Array([0]);
    }

    const certificate = challenger.getCertificate();
    mutableCert.data = certificate.toString("base64");
    mutableCert.status = challenger.state;

    if (challenger.hasFailed() || !verifyProtocol(challenger)) {
      await AuthCertificateDAO.update(cert.id, { status: -2, data: mutableCert.data });
      return new Uint8Array([0]);
    }

    if (challenger.isComplete()) {
      const ok = await handleSuccess(mutableCert, challenger);
      if (!ok) {
        await AuthCertificateDAO.update(cert.id, { status: -2, data: mutableCert.data });
        return new Uint8Array([0]);
      }
    }

    await AuthCertificateDAO.update(cert.id, {
      status: mutableCert.status,
      data: mutableCert.data,
      metadata: mutableCert.metadata ?? undefined,
    });
    return CryptoChannel.encrypt(certificate, uintkey);
  }

  static async connecting(key: string): Promise<AuthCertificate | null> {
    if (!key) return null;
    return AuthCertificateDAO.findByKey(key);
  }

  static async listen(token: string): Promise<AuthCertificate | null> {
    if (!token) return null;
    return AuthCertificateDAO.findByConnection(token);
  }

  static async consumeCertificate(key: string): Promise<boolean> {
    const cert = await AuthCertificateDAO.findByKey(key);
    if (!cert || !cert.connection || cert.status !== 2) return false;
    await AuthCertificateDAO.delete(cert.id);
    return true;
  }

  static async hasAnyHuman(): Promise<boolean> {
    return (await PrincipalDAO.count({ kind: "human" })) > 0;
  }
}
