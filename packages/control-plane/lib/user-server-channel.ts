/**
 * UserServerChannel — VaultysID challenger protocol for human user authentication.
 * Adapted from temp/serverChannel.ts, replacing the DAO/Redis/Prisma layer with
 * VaultysClaw's SQLite-backed CertificateDao and UserDao.
 */
import { Challenger, CryptoChannel, VaultysId, crypto } from "@vaultys/id";
import { getSetting } from "./db";
import { CertificateDao, type Certificate } from "./certificate-dao";
import { UserDao } from "./user-dao";

const Buffer = crypto.Buffer;

const registrationKey = (key: string) =>
  crypto.hash("sha256", Buffer.from(`vaultys-${key}-server`)).toString("hex");

const connectionKey = (key: string) =>
  crypto.hash("sha256", Buffer.from(`connecting-${key}-vaultys`)).toString("hex");

const verifyProtocol = (challenger: Challenger) => {
  const { protocol, service } = challenger.getContext();
  return protocol === "p2p" && (service === "register" || service === "auth");
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
};

const handleError = async (error: string, cert?: Certificate): Promise<Uint8Array> => {
  if (cert) {
    CertificateDao.update(cert.id, {
      ...cert,
      status: -2,
      metadata: JSON.stringify({
        ...JSON.parse(cert.metadata ?? "{}"),
        error,
      }),
    });
  }
  return new Uint8Array([0]);
};

const registerUser = (contact: VaultysId, pendingUserId?: string): boolean => {
  const did = contact.toVersion(1).did;
  const publicKey = contact.id.toString("base64");
  const existing = UserDao.getByDid(did);
  console.log(`[registerUser] did=${did} existing=${JSON.stringify(existing)}`);
  if (existing) {
    // If this real DID already exists and was an Entra/email placeholder, mark as claimed.
    if (!existing.claimed_at && (existing.entra_id || !existing.did)) {
      UserDao.claimEntraUser(existing.id, did, publicKey);
    }
    console.log(`[registerUser] already registered — returning true`);
    return true;
  }

  // If the cert was generated for a specific unclaimed user (Entra or email-invited), claim that record.
  if (pendingUserId) {
    const pending = UserDao.getById(pendingUserId);
    if (pending && !pending.claimed_at && !pending.did) {
      console.log(`[registerUser] claiming unclaimed user id=${pendingUserId} → ${did}`);
      UserDao.claimEntraUser(pendingUserId, did, publicKey);
      return true;
    }
  }

  const isOwner = !UserDao.hasAnyUser();
  console.log(`[registerUser] creating new user isOwner=${isOwner}`);
  UserDao.create(did, publicKey, isOwner);
  console.log(`[registerUser] created successfully`);
  return true;
};

const loginUser = (contact: VaultysId): boolean => {
  const did = contact.toVersion(1).did;
  const user = UserDao.getByDid(did);
  console.log(`[loginUser] did=${did} found=${JSON.stringify(user)}`);
  if (!user) {
    console.warn(`[loginUser] FAILED — DID not in users table. Did you register with a different wallet, or was the DB not reset between runs?`);
  }
  return user !== null;
};

const handleSuccess = (cert: Certificate, challenger: Challenger): boolean => {
  const contact = challenger.getContactId();
  const did = contact.toVersion(1).did;
  const meta = JSON.parse(cert.metadata ?? "{}") as Record<string, unknown>;
  const deviceType = meta.deviceType as string | undefined;

  console.log(`[handleSuccess] cert.id=${cert.id} cert.register=${cert.register} deviceType=${deviceType} walletDid=${did}`);

  // Browser / extension devices are authenticating themselves (bastion flow).
  // They are not "users" — just store their DID in the cert so listenBastion
  // can return it, then return true without touching the users table.
  if (deviceType === "BROWSER" || deviceType === "BROWSER_EXTENSION") {
    meta.did = did;
    cert.metadata = JSON.stringify(meta);
    console.log(`[handleSuccess] browser device — returning true without touching users table`);
    return true;
  }

  // Wallet devices: register on first use, or verify existing user on login.
  const pendingUserId = meta.pendingUserId as string | undefined;
  let ok: boolean;
  if (cert.register) {
    console.log(`[handleSuccess] register=1 → calling registerUser (pendingUserId=${pendingUserId})`);
    ok = registerUser(contact, pendingUserId);
  } else {
    console.log(`[handleSuccess] register=0 → calling loginUser (hasAnyUser at cert creation time was true)`);
    ok = loginUser(contact);
  }
  if (ok) {
    meta.did = did;
    cert.metadata = JSON.stringify(meta);
  }
  console.log(`[handleSuccess] result=${ok}`);
  return ok;
};

export const parseUserAgent = (userAgent: string): { browser?: string; os?: string } => {
  const browser = new RegExp(/(Chrome|Firefox|Safari|Edge|Opera)/i).exec(userAgent)?.[1];
  let os: string | undefined;
  if (/Windows/i.test(userAgent)) os = "Windows";
  else if (/Mac OS X/i.test(userAgent)) os = "macOS";
  else if (/Linux/i.test(userAgent)) os = "Linux";
  else if (/Android/i.test(userAgent)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(userAgent)) os = "iOS";
  return { browser, os };
};

export class UserServerChannel {
  static createRegistrationCertificate(metadata?: Record<string, unknown>): Certificate {
    const key = crypto.randomBytes(32).toString("hex");
    const registration = registrationKey(key);
    const connection = connectionKey(key);
    return CertificateDao.create({
      key,
      registration,
      connection,
      register: 1,
      data: "",
      status: -1,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
  }

  static createConnectionCertificate(metadata?: Record<string, unknown>): Certificate {
    const key = crypto.randomBytes(32).toString("hex");
    const registration = registrationKey(key);
    const connection = connectionKey(key);
    return CertificateDao.create({
      key,
      registration,
      connection,
      register: 0,
      data: "",
      status: -1,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
  }

  static async handleBastionConnect(
    browserVid: string,
    ip?: string,
    userAgent?: string,
    deviceType: "BROWSER" | "BROWSER_EXTENSION" = "BROWSER",
  ): Promise<{ key: string } | undefined> {
    const { browser, os } = userAgent ? parseUserAgent(userAgent) : {};
    const cert = UserServerChannel.createConnectionCertificate({
      id: browserVid,
      deviceType,
      ip,
      userAgent,
      browser,
      os,
    });
    const vaultysId = Buffer.from(browserVid, "base64");
    const encryptedKey = await VaultysId.encrypt(cert.key, [vaultysId]);
    return { key: encryptedKey };
  }

  static listenBastion(token: string): { status: number; browserDid?: string } | null {
    if (!token) return null;
    const cert = CertificateDao.getByConnection(token);
    if (!cert) return null;
    if (cert.status === 2) {
      const metadata: Record<string, unknown> = JSON.parse(cert.metadata ?? "{}");
      return { status: cert.status, browserDid: metadata.id as string | undefined };
    }
    return { status: cert.status };
  }

  static async handleRequest(token: string, data: string): Promise<Uint8Array> {
    if (!token) return handleError("No token");

    const cert = CertificateDao.getByRegistration(token);
    if (!cert) return handleError("No certificate found");

    const uintkey = Buffer.from(cert.key, "hex");
    const serverSecret = getSetting("serverSecret");
    if (!serverSecret) return handleError("Server identity not initialized", cert);

    const vid = VaultysId.fromSecret(serverSecret, "base64");
    const challenger = new Challenger(vid.toVersion(1));

    if (cert.data) {
      try {
        await challenger.init(Buffer.from(cert.data, "base64"));
      } catch (error: unknown) {
        return handleError(getErrorMessage(error), cert);
      }
    }

    const decoded = CryptoChannel.decrypt(Buffer.from(data, "base64"), uintkey);

    try {
      await challenger.update(decoded);
    } catch (error: unknown) {
      return handleError(getErrorMessage(error), cert);
    }

    const certificate = challenger.getCertificate();
    cert.status = challenger.state;
    cert.data = certificate.toString("base64");

    if (challenger.hasFailed()) {
      return handleError(challenger.challenge?.error ?? "Challenge failed", cert);
    }

    if (!verifyProtocol(challenger)) {
      return handleError("Protocol has been tampered with", cert);
    }

    if (challenger.isComplete()) {
      if (!handleSuccess(cert, challenger)) {
        return handleError("Failed to register or authenticate user", cert);
      }
    }

    CertificateDao.update(cert.id, { status: cert.status, data: cert.data, metadata: cert.metadata });
    return CryptoChannel.encrypt(certificate, uintkey);
  }

  static consumeCertificate(key: string): boolean {
    // Certificates are keyed by connection token (sha256 hash), not the raw key.
    // Look up the cert first, then delete by its connection column.
    const cert = CertificateDao.getByKey(key);
    if (!cert) return false;
    const { count } = CertificateDao.consumeCertificate(cert.connection);
    return count === 1;
  }

  /**
   * Opens a server-side PeerJS channel as initiator, runs the full Challenger
   * protocol when the wallet connects, then writes the result to the certificate.
   * The browser only needs to display the QR code and poll /api/user/listen/[token].
   *
   * Returns the PeerJS connection string that the browser encodes in the QR URL:
   *   https://wallet.vaultys.net/#<connectionString>&protocol=p2p&service=auth&did=<serverDid>
   */
  static async startP2PSession(cert: Certificate): Promise<string> {
    const { PeerjsChannel } = await import("@vaultys/channel-peerjs");

    const peerjsHost = getSetting("peerjs_host") || undefined;
    const channel = new PeerjsChannel(cert.key, "initiator", peerjsHost);
    const connectionString = channel.getConnectionString();

    // Run the full Challenger exchange in the background. WebRTC globals are
    // polyfilled at server startup via lib/webrtc-polyfill.ts.
    // The API route returns immediately; the session lives in the Node.js event loop.
    (async () => {
      console.log(`[P2P] session started for cert.id=${cert.id} key=${cert.key.slice(0, 8)}...`);
      try {
        // Block until the wallet connects via PeerJS relay
        console.log(`[P2P] waiting for wallet to connect...`);
        await channel.start();
        console.log(`[P2P] wallet connected`);

        const serverSecret = getSetting("serverSecret");
        if (!serverSecret) {
          console.error(`[P2P] no serverSecret — aborting`);
          CertificateDao.update(cert.id, { status: -2 });
          return;
        }

        const vid = VaultysId.fromSecret(serverSecret, "base64");
        console.log(`[P2P] server DID=${vid.toVersion(1).did}`);
        const challenger = new Challenger(vid.toVersion(1));
        console.log(`[P2P] challenger created, initial state=${challenger.state}`);

        // P2P Challenger exchange:
        //   round 0: wallet sends challenge cert → server updates → server sends back
        //   round 1: wallet sends final cert → server updates → protocol complete
        for (let round = 0; round < 4; round++) {
          console.log(`[P2P] round ${round}: waiting for wallet cert (challenger.state=${challenger.state})`);
          const walletCert = await channel.receive();
          console.log(`[P2P] round ${round}: received ${walletCert.length} bytes`);

          try {
            await challenger.update(walletCert);
          } catch (updateErr) {
            console.error(`[P2P] round ${round}: challenger.update() threw:`, updateErr);
            CertificateDao.update(cert.id, { status: -2 });
            break;
          }

          const ctx = challenger.getContext();
          console.log(`[P2P] round ${round}: challenger state after update=${challenger.state}, protocol=${ctx.protocol}, service=${ctx.service}`);

          cert.data = challenger.getCertificate().toString("base64");
          cert.status = challenger.state;

          if (challenger.hasFailed()) {
            console.error(`[P2P] round ${round}: challenger.hasFailed() — error=${(challenger as unknown as { challenge?: { error?: string } }).challenge?.error}`);
            CertificateDao.update(cert.id, { status: -2, data: cert.data });
            break;
          }

          const protocolOk = verifyProtocol(challenger);
          console.log(`[P2P] round ${round}: verifyProtocol=${protocolOk} (expected protocol=p2p, service=register|auth, got protocol=${ctx.protocol}, service=${ctx.service})`);
          if (!protocolOk) {
            CertificateDao.update(cert.id, { status: -2, data: cert.data });
            break;
          }

          if (challenger.isComplete()) {
            console.log(`[P2P] round ${round}: protocol COMPLETE — calling handleSuccess`);
            const ok = handleSuccess(cert, challenger);
            console.log(`[P2P] round ${round}: handleSuccess=${ok}, metadata=${cert.metadata}`);
            CertificateDao.update(cert.id, {
              status: ok ? 2 : -2,
              data: cert.data,
              metadata: cert.metadata,
            });
            break;
          }

          // Not yet complete — send server cert and wait for next round
          const serverCert = challenger.getCertificate();
          console.log(`[P2P] round ${round}: sending server cert (${serverCert.length} bytes)`);
          await channel.send(serverCert);
        }
      } catch (err) {
        console.error("[P2P session error]", err);
        CertificateDao.update(cert.id, { status: -2 });
      } finally {
        console.log(`[P2P] session ending for cert.id=${cert.id}`);
        await channel.close().catch(() => { });
      }
    })();

    return connectionString;
  }

  static connecting(token: string): Certificate | null {
    if (!token) return null;
    return CertificateDao.getByKey(token);
  }

  static listen(token: string): Certificate | null {
    if (!token) return null;
    return CertificateDao.getByConnection(token);
  }
}
