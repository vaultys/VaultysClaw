/**
 * UserServerChannel — VaultysID challenger protocol for human user authentication.
 * Adapted from temp/serverChannel.ts, replacing the DAO/Redis/Prisma layer with
 * VaultysClaw's Prisma-backed CertificateDAO and UserDAO.
 */
import { Challenger, CryptoChannel, VaultysId, crypto } from "@vaultys/id";
import { CertificateDAO, SettingsDAO, UserDAO } from "@/db";
import type { Certificate } from "@prisma/client";

const Buffer = crypto.Buffer;

const registrationKey = (key: string) =>
  crypto.hash("sha256", Buffer.from(`vaultys-${key}-server`)).toString("hex");

const connectionKey = (key: string) =>
  crypto
    .hash("sha256", Buffer.from(`connecting-${key}-vaultys`))
    .toString("hex");

const verifyProtocol = (challenger: Challenger) => {
  const { protocol, service } = challenger.getContext();
  return protocol === "p2p" && (service === "register" || service === "auth");
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
};

const handleError = async (
  error: string,
  cert?: Certificate & { metadata: string | null }
): Promise<Uint8Array> => {
  if (cert) {
    await CertificateDAO.update(cert.id, {
      status: -2,
      metadata: JSON.stringify({
        ...JSON.parse(cert.metadata ?? "{}"),
        error,
      }),
    });
  }
  return new Uint8Array([0]);
};

const registerUser = async (contact: VaultysId, pendingUserId?: string): Promise<boolean> => {
  const did = contact.toVersion(1).did;
  const publicKey = contact.id.toString("base64");
  const existing = await UserDAO.findByDid(did);
  console.log(`[registerUser] did=${did} existing=${JSON.stringify(existing)}`);
  if (existing) {
    // If this real DID already exists and was an Entra/email placeholder, mark as claimed.
    if (!existing.claimedAt && (existing.entraId || !existing.did)) {
      await UserDAO.claim(existing.id, did, publicKey);
    }
    console.log(`[registerUser] already registered — returning true`);
    return true;
  }

  // If the cert was generated for a specific unclaimed user (Entra or email-invited), claim that record.
  if (pendingUserId) {
    const pending = await UserDAO.findById(pendingUserId);
    if (pending && !pending.claimedAt && !pending.did) {
      console.log(
        `[registerUser] claiming unclaimed user id=${pendingUserId} → ${did}`
      );
      await UserDAO.claim(pendingUserId, did, publicKey);
      return true;
    }
  }

  const isOwner = (await UserDAO.list({ page: 1, pageSize: 1 })).total === 0;
  console.log(`[registerUser] creating new user isOwner=${isOwner}`);
  await UserDAO.create(did, publicKey, isOwner);
  console.log(`[registerUser] created successfully`);
  return true;
};

const loginUser = async (contact: VaultysId): Promise<boolean> => {
  const did = contact.toVersion(1).did;
  const user = await UserDAO.findByDid(did);
  console.log(`[loginUser] did=${did} found=${JSON.stringify(user)}`);
  if (!user) {
    console.warn(
      `[loginUser] FAILED — DID not in users table. Did you register with a different wallet, or was the DB not reset between runs?`
    );
  }
  return user !== null;
};

// Mutable working copy of a Certificate during the challenger protocol
type MutableCert = {
  id: string;
  key: string;
  registration: string | null;
  connection: string | null;
  register: number;
  data: string;
  status: number;
  metadata: string | null;
  startedAt: Date;
};

const handleSuccess = async (cert: MutableCert, challenger: Challenger): Promise<boolean> => {
  const contact = challenger.getContactId();
  const did = contact.toVersion(1).did;
  const meta = JSON.parse(cert.metadata ?? "{}") as Record<string, unknown>;
  const deviceType = meta.deviceType as string | undefined;

  console.log(
    `[handleSuccess] cert.id=${cert.id} cert.register=${cert.register} deviceType=${deviceType} walletDid=${did}`
  );

  // Browser / extension devices are authenticating themselves (bastion flow).
  // They are not "users" — just store their DID in the cert so listenBastion
  // can return it, then return true without touching the users table.
  if (deviceType === "BROWSER" || deviceType === "BROWSER_EXTENSION") {
    meta.did = did;
    cert.metadata = JSON.stringify(meta);
    console.log(
      `[handleSuccess] browser device — returning true without touching users table`
    );
    return true;
  }

  // Wallet devices: register on first use, or verify existing user on login.
  const pendingUserId = meta.pendingUserId as string | undefined;
  let ok: boolean;
  if (cert.register) {
    console.log(
      `[handleSuccess] register=1 → calling registerUser (pendingUserId=${pendingUserId})`
    );
    ok = await registerUser(contact, pendingUserId);
  } else {
    console.log(
      `[handleSuccess] register=0 → calling loginUser (hasAnyUser at cert creation time was true)`
    );
    ok = await loginUser(contact);
  }
  if (ok) {
    meta.did = did;
    cert.metadata = JSON.stringify(meta);
  }
  console.log(`[handleSuccess] result=${ok}`);
  return ok;
};

export const parseUserAgent = (
  userAgent: string
): { browser?: string; os?: string } => {
  const browser = new RegExp(/(Chrome|Firefox|Safari|Edge|Opera)/i).exec(
    userAgent
  )?.[1];
  let os: string | undefined;
  if (/Windows/i.test(userAgent)) os = "Windows";
  else if (/Mac OS X/i.test(userAgent)) os = "macOS";
  else if (/Linux/i.test(userAgent)) os = "Linux";
  else if (/Android/i.test(userAgent)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(userAgent)) os = "iOS";
  return { browser, os };
};

export class UserServerChannel {
  static async createRegistrationCertificate(
    metadata?: Record<string, unknown>
  ): Promise<Certificate> {
    const key = crypto.randomBytes(32).toString("hex");
    const registration = registrationKey(key);
    const connection = connectionKey(key);
    const id = crypto.randomBytes(16).toString("hex");
    return CertificateDAO.create({
      id,
      key,
      registration,
      connection,
      register: 1,
      data: "",
      metadata: metadata ? JSON.stringify(metadata) : undefined,
    });
  }

  static async createConnectionCertificate(
    metadata?: Record<string, unknown>
  ): Promise<Certificate> {
    const key = crypto.randomBytes(32).toString("hex");
    const registration = registrationKey(key);
    const connection = connectionKey(key);
    const id = crypto.randomBytes(16).toString("hex");
    return CertificateDAO.create({
      id,
      key,
      registration,
      connection,
      register: 0,
      data: "",
      metadata: metadata ? JSON.stringify(metadata) : undefined,
    });
  }

  static async handleBastionConnect(
    browserVid: string,
    ip?: string,
    userAgent?: string,
    deviceType: "BROWSER" | "BROWSER_EXTENSION" = "BROWSER"
  ): Promise<{ key: string } | undefined> {
    const { browser, os } = userAgent ? parseUserAgent(userAgent) : {};
    const cert = await UserServerChannel.createConnectionCertificate({
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

  static async listenBastion(
    token: string
  ): Promise<{ status: number; browserDid?: string } | null> {
    if (!token) return null;
    const cert = await CertificateDAO.findByConnection(token);
    if (!cert) return null;
    if (cert.status === 2) {
      const metadata: Record<string, unknown> = JSON.parse(
        cert.metadata ?? "{}"
      );
      return {
        status: cert.status,
        browserDid: metadata.id as string | undefined,
      };
    }
    return { status: cert.status };
  }

  static async handleRequest(token: string, data: string): Promise<Uint8Array> {
    if (!token) return handleError("No token");

    const dbCert = await CertificateDAO.findByRegistration(token);
    if (!dbCert) return handleError("No certificate found");

    // Work with a mutable copy so we can track in-progress state changes
    const cert: MutableCert = { ...dbCert };

    const uintkey = Buffer.from(cert.key, "hex");
    const serverSecret = await SettingsDAO.get("serverSecret");
    if (!serverSecret)
      return handleError("Server identity not initialized", cert);

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
      return handleError(
        challenger.challenge?.error ?? "Challenge failed",
        cert
      );
    }

    if (!verifyProtocol(challenger)) {
      return handleError("Protocol has been tampered with", cert);
    }

    if (challenger.isComplete()) {
      if (!(await handleSuccess(cert, challenger))) {
        return handleError("Failed to register or authenticate user", cert);
      }
    }

    await CertificateDAO.update(cert.id, {
      status: cert.status,
      data: cert.data,
      metadata: cert.metadata ?? undefined,
    });
    return CryptoChannel.encrypt(certificate, uintkey);
  }

  static async consumeCertificate(key: string): Promise<boolean> {
    // Certificates are keyed by connection token (sha256 hash), not the raw key.
    // Look up the cert first, then delete it by id if it is in completed state.
    const cert = await CertificateDAO.findByKey(key);
    if (!cert || !cert.connection || cert.status !== 2) return false;
    await CertificateDAO.delete(cert.id);
    return true;
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

    const peerjsHost = await SettingsDAO.get("peerjs_host") || undefined;
    const channel = new PeerjsChannel(cert.key, "initiator", peerjsHost);
    const connectionString = channel.getConnectionString();

    // Run the full Challenger exchange in the background. WebRTC globals are
    // polyfilled at server startup via lib/webrtc-polyfill.ts.
    // The API route returns immediately; the session lives in the Node.js event loop.
    (async () => {
      // Work with a mutable copy so we can track in-progress state changes
      const mutableCert: MutableCert = { ...cert };

      console.log(
        `[P2P] session started for cert.id=${cert.id} key=${cert.key.slice(0, 8)}...`
      );
      try {
        // Block until the wallet connects via PeerJS relay
        console.log(`[P2P] waiting for wallet to connect...`);
        await channel.start();
        console.log(`[P2P] wallet connected`);

        const serverSecret = await SettingsDAO.get("serverSecret");
        if (!serverSecret) {
          console.error(`[P2P] no serverSecret — aborting`);
          await CertificateDAO.update(cert.id, { status: -2 });
          return;
        }

        const vid = VaultysId.fromSecret(serverSecret, "base64");
        console.log(`[P2P] server DID=${vid.toVersion(1).did}`);
        const challenger = new Challenger(vid.toVersion(1));
        console.log(
          `[P2P] challenger created, initial state=${challenger.state}`
        );

        // P2P Challenger exchange:
        //   round 0: wallet sends challenge cert → server updates → server sends back
        //   round 1+: some wallet versions close the channel after round 0 (1-round
        //             exchange). PeerJS does not signal closure, so channel.receive()
        //             hangs forever. We race against a 5-second timeout; if it fires
        //             and challenger.state === 1 (wallet identity verified in round 0),
        //             we treat the exchange as complete.
        for (let round = 0; round < 4; round++) {
          console.log(
            `[P2P] round ${round}: waiting for wallet cert (challenger.state=${challenger.state})`
          );

          let walletCert: Uint8Array;
          try {
            walletCert = await (round === 0
              ? channel.receive()
              : Promise.race([
                  channel.receive(),
                  new Promise<never>((_, reject) =>
                    setTimeout(
                      () => reject(new Error("p2p-round-timeout")),
                      5_000
                    )
                  ),
                ]));
          } catch (receiveErr) {
            const isTimeout =
              receiveErr instanceof Error &&
              receiveErr.message === "p2p-round-timeout";
            if (isTimeout && challenger.state === 1 && verifyProtocol(challenger)) {
              // Wallet completed a 1-round exchange (e.g. PQC wallet) — identity
              // verified in round 0. getContactId() requires isComplete() so we use
              // getContactDid() (which only checks hisKey, set at STEP1) and
              // reconstruct a VaultysId directly from the raw hisKey buffer.
              console.log(
                `[P2P] round ${round}: wallet closed after 1-round exchange (state=1)`
              );
              const contactDid = challenger.getContactDid();
              const hisKeyRaw = (challenger as unknown as { hisKey: Buffer }).hisKey;
              if (!contactDid || !hisKeyRaw) {
                console.error(
                  `[P2P] round ${round}: missing contactDid/hisKey at state=1`
                );
                await CertificateDAO.update(cert.id, { status: -2 });
              } else {
                const contact = VaultysId.fromId(hisKeyRaw);
                const meta = JSON.parse(mutableCert.metadata ?? "{}") as Record<string, unknown>;
                const pendingUserId = meta.pendingUserId as string | undefined;
                const ok = await (mutableCert.register === 1
                  ? registerUser(contact, pendingUserId)
                  : loginUser(contact));
                console.log(
                  `[P2P] round ${round}: 1-round result=${String(ok)} did=${contactDid}`
                );
                mutableCert.metadata = JSON.stringify({ ...meta, did: contactDid });
                await CertificateDAO.update(cert.id, {
                  status: ok ? 2 : -2,
                  data: mutableCert.data,
                  metadata: mutableCert.metadata,
                });
              }
            } else {
              console.error(
                `[P2P] round ${round}: receive failed (isTimeout=${isTimeout}):`,
                receiveErr
              );
              await CertificateDAO.update(cert.id, { status: -2 });
            }
            break;
          }

          console.log(
            `[P2P] round ${round}: received ${walletCert.length} bytes`
          );

          try {
            await challenger.update(walletCert);
          } catch (updateErr) {
            console.error(
              `[P2P] round ${round}: challenger.update() threw:`,
              updateErr
            );
            await CertificateDAO.update(cert.id, { status: -2 });
            break;
          }

          const ctx = challenger.getContext();
          console.log(
            `[P2P] round ${round}: challenger state after update=${challenger.state}, protocol=${ctx.protocol}, service=${ctx.service}`
          );

          mutableCert.data = challenger.getCertificate().toString("base64");
          mutableCert.status = challenger.state;

          if (challenger.hasFailed()) {
            console.error(
              `[P2P] round ${round}: challenger.hasFailed() — error=${(challenger as unknown as { challenge?: { error?: string } }).challenge?.error}`
            );
            await CertificateDAO.update(cert.id, { status: -2, data: mutableCert.data });
            break;
          }

          const protocolOk = verifyProtocol(challenger);
          console.log(
            `[P2P] round ${round}: verifyProtocol=${protocolOk} (expected protocol=p2p, service=register|auth, got protocol=${ctx.protocol}, service=${ctx.service})`
          );
          if (!protocolOk) {
            await CertificateDAO.update(cert.id, { status: -2, data: mutableCert.data });
            break;
          }

          if (challenger.isComplete()) {
            console.log(
              `[P2P] round ${round}: protocol COMPLETE — calling handleSuccess`
            );
            const ok = await handleSuccess(mutableCert, challenger);
            console.log(
              `[P2P] round ${round}: handleSuccess=${String(ok)}, metadata=${mutableCert.metadata}`
            );
            await CertificateDAO.update(cert.id, {
              status: ok ? 2 : -2,
              data: mutableCert.data,
              metadata: mutableCert.metadata ?? undefined,
            });
            break;
          }

          // Not yet complete — send server cert and wait for next round
          const serverCert = challenger.getCertificate();
          console.log(
            `[P2P] round ${round}: sending server cert (${serverCert.length} bytes)`
          );
          await channel.send(serverCert);
        }
      } catch (err) {
        console.error("[P2P session error]", err);
        await CertificateDAO.update(cert.id, { status: -2 });
      } finally {
        console.log(`[P2P] session ending for cert.id=${cert.id}`);
        await channel.close().catch(() => {});
      }
    })();

    return connectionString;
  }

  static async connecting(token: string): Promise<Certificate | null> {
    if (!token) return null;
    return CertificateDAO.findByKey(token);
  }

  static async listen(token: string): Promise<Certificate | null> {
    if (!token) return null;
    return CertificateDAO.findByConnection(token);
  }
}
