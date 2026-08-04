/**
 * VaultysId QR-code (P2P/WebRTC) login channel for human Actors, plus the
 * classic (non-WebRTC) dev-mode transport's *second* SRP round: the bootstrap
 * flow is double SRP — one live `Challenger` exchange to connect/register the
 * human (`service: "register"`/`"auth"`), and, only for a brand-new human
 * when no admin exists yet, a second, independent live exchange
 * (`service: "certificate"`) that actually co-signs the `admin_console_access`
 * grant, run over the same still-live connection immediately after the first
 * completes (docs/CERTIFICATE_WEB_OF_TRUST.md §3.2b). The QR/PeerJS wallet
 * path keeps the single-SRP, system-issued bootstrap grant instead
 * (`ensureBootstrapAdmin`, §3.2a) — a real third-party wallet app can't be
 * assumed to understand an unprompted follow-up `service: "certificate"`
 * challenge, unlike the dev-mode browser identity, which is code this repo
 * owns end to end (`lib/browser-connect.ts`).
 *
 * Ported from packages/control-plane's `UserServerChannel`, trimmed to only
 * the P2P wallet-pairing flow — the browser-extension "bastion" pairing is
 * not reused here; it's a separate feature, not the core login primitive
 * docs/REBUILD_ARCHITECTURE.md §1 requires to stay unchanged.
 *
 * Register vs. login is decided by whether any human Actor exists yet.
 */
import { Challenger, CryptoChannel, VaultysId, crypto } from "@vaultys/id";
import pino from "pino";
import type { AgentCapability } from "@vaultysclaw/policy";
import { AuthCertificateDAO, ActorDAO, UserDAO } from "@/db";
import { ServerIdentityDAO } from "@/db/settings.dao";
import {
  BOOTSTRAP_ADMIN_CERT_ID,
  ensureBootstrapAdmin,
  isBootstrapAdminNeeded,
  persistChallengerCertificate,
} from "./certificates";
import type { AuthCertificate } from "@prisma/client";

const logger = pino({ name: "user-login-channel" });
const Buffer = crypto.Buffer;

function verifyProtocol(challenger: Challenger): boolean {
  const { protocol, service } = challenger.getContext();
  return protocol === "p2p" && (service === "register" || service === "auth");
}

function verifyCertificateProtocol(challenger: Challenger): boolean {
  const { protocol, service } = challenger.getContext();
  return protocol === "p2p" && service === "certificate";
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

/** Stashed in a "certificate round" AuthCertificate's `metadata` — what to grant once its live
 *  exchange completes (there's no PendingRegistration for humans, so this row IS the approval). */
interface CertRoundMeta {
  kind: "certificate";
  humanDid: string;
  capabilities: AgentCapability[];
  certId: string;
  issuedBy: string;
}

async function registerHuman(contact: VaultysId): Promise<boolean> {
  const did = contact.toVersion(1).did;
  const publicKey = Buffer.from(contact.id).toString("base64");
  await UserDAO.ensureExists(did, "Unnamed", null, publicKey);
  logger.info({ did }, "New human Actor registered");
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

interface LoginResult {
  ok: boolean;
  did: string;
  isNewRegistration: boolean;
}

async function handleSuccess(cert: MutableCert, challenger: Challenger): Promise<LoginResult> {
  const contact = challenger.getContactId();
  const did = contact.toVersion(1).did;
  const meta = JSON.parse(cert.metadata ?? "{}") as Record<string, unknown>;
  const isNewRegistration = cert.register === 1;

  const ok = isNewRegistration ? await registerHuman(contact) : await loginHuman(contact);
  if (ok) {
    meta.did = did;
    cert.metadata = JSON.stringify(meta);
  }
  return { ok, did, isNewRegistration };
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
   * The second half of the dev-mode bootstrap's double SRP
   * (docs/CERTIFICATE_WEB_OF_TRUST.md §3.2b): a fresh `AuthCertificate` row,
   * same hashing scheme as the two above, but tagged in `metadata` so
   * `handleRequest` routes rounds against it to `handleCertificateRequest`
   * instead of the login dispatch. This row *is* the approval — there's no
   * separate `PendingRegistration` for a human bootstrapping themselves.
   */
  static async createCertificateRound(
    humanDid: string,
    capabilities: AgentCapability[],
    certId: string,
    issuedBy: string
  ): Promise<AuthCertificate> {
    const key = crypto.randomBytes(32).toString("hex");
    const meta: CertRoundMeta = { kind: "certificate", humanDid, capabilities, certId, issuedBy };
    return AuthCertificateDAO.create({
      id: crypto.randomBytes(16).toString("hex"),
      key,
      registration: crypto.hash("sha256", Buffer.from(`vaultys-${key}-server`)).toString("hex"),
      connection: crypto.hash("sha256", Buffer.from(`connecting-${key}-vaultys`)).toString("hex"),
      register: 0,
      data: "",
      metadata: JSON.stringify(meta),
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
                const isNewRegistration = mutableCert.register === 1;
                const ok = await (isNewRegistration ? registerHuman(contact) : loginHuman(contact));
                if (ok && isNewRegistration) await ensureBootstrapAdmin(contactDid);
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
            const result = await handleSuccess(mutableCert, challenger);
            if (result.ok && result.isNewRegistration) await ensureBootstrapAdmin(result.did);
            await AuthCertificateDAO.update(cert.id, {
              status: result.ok ? 2 : -2,
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

    const existingMeta = JSON.parse(cert.metadata ?? "{}") as Partial<CertRoundMeta>;
    if (existingMeta.kind === "certificate") {
      return UserLoginChannel.handleCertificateRequest(cert, existingMeta as CertRoundMeta, data);
    }

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
      const result = await handleSuccess(mutableCert, challenger);
      if (!result.ok) {
        await AuthCertificateDAO.update(cert.id, { status: -2, data: mutableCert.data });
        return new Uint8Array([0]);
      }
      if (result.isNewRegistration && (await isBootstrapAdminNeeded())) {
        const certRound = await UserLoginChannel.createCertificateRound(
          result.did,
          ["admin_console_access"],
          BOOTSTRAP_ADMIN_CERT_ID,
          "system:bootstrap"
        );
        const meta = JSON.parse(mutableCert.metadata ?? "{}") as Record<string, unknown>;
        // Only `key` is needed — BrowserChannel derives its own request-route token from it,
        // exactly like the login round's own key does (see lib/browser-connect.ts).
        meta.certRound = { key: certRound.key };
        mutableCert.metadata = JSON.stringify(meta);
      }
    }

    await AuthCertificateDAO.update(cert.id, {
      status: mutableCert.status,
      data: mutableCert.data,
      metadata: mutableCert.metadata ?? undefined,
    });
    return CryptoChannel.encrypt(certificate, uintkey);
  }

  /**
   * One round of the same classic-transport Challenger protocol as
   * `handleRequest`, but for a "certificate round" row: `service` must be
   * `"certificate"` (not `"register"`/`"auth"`), the first server-side round
   * embeds the stashed `capabilities` as metadata (mirroring
   * `lib/ws-server.ts`'s agent issuance exactly), and completion persists a
   * `certFormat: "challenger"` grant instead of dispatching to
   * register/login.
   */
  private static async handleCertificateRequest(
    cert: AuthCertificate,
    meta: CertRoundMeta,
    data: string
  ): Promise<Uint8Array> {
    const uintkey = Buffer.from(cert.key, "hex");
    const vid = await ServerIdentityDAO.getServerVaultysId();
    const challenger = new Challenger(vid);
    const isFirstRound = !cert.data;

    if (cert.data) {
      try {
        await challenger.init(Buffer.from(cert.data, "base64"));
      } catch (err) {
        logger.warn({ err }, "Challenger.init failed (certificate round)");
        await AuthCertificateDAO.update(cert.id, { status: -2 });
        return new Uint8Array([0]);
      }
    }

    const decoded = CryptoChannel.decrypt(Buffer.from(data, "base64"), uintkey);

    try {
      // JSON-encoded as a single string value, not a raw array — same convention as
      // lib/ws-server.ts's agent issuance, so every embedder in this codebase agrees on one
      // format any Challenger implementation (not just this TS one) can decode.
      const metadata = isFirstRound
        ? ({ capabilities: JSON.stringify(meta.capabilities) } satisfies Record<string, string>)
        : undefined;
      await challenger.update(decoded, metadata);
    } catch (err) {
      logger.warn({ err }, "Challenger.update failed (certificate round)");
      await AuthCertificateDAO.update(cert.id, { status: -2 });
      return new Uint8Array([0]);
    }

    const certificate = challenger.getCertificate();
    const dataB64 = certificate.toString("base64");

    if (challenger.hasFailed() || !verifyCertificateProtocol(challenger)) {
      await AuthCertificateDAO.update(cert.id, { status: -2, data: dataB64 });
      return new Uint8Array([0]);
    }

    if (challenger.isComplete()) {
      const persisted = await persistChallengerCertificate({
        certId: meta.certId,
        agentDid: meta.humanDid,
        capabilities: meta.capabilities,
        certificateBase64: dataB64,
        expiresAt: null,
        issuedBy: meta.issuedBy,
      });
      logger.info(
        { certId: meta.certId, humanDid: meta.humanDid, granted: persisted !== null },
        "Certificate round completed"
      );
    }

    await AuthCertificateDAO.update(cert.id, { status: challenger.state, data: dataB64 });
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
    return (await ActorDAO.count({ kind: "human" })) > 0;
  }
}
