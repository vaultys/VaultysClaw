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
import { AuthCertificateDAO, ActorDAO, UserDAO, InvitationDAO } from "@/db";
import { ServerIdentityDAO } from "@/db/settings.dao";
import {
  BOOTSTRAP_ADMIN_CERT_ID,
  ensureBootstrapAdmin,
  isBootstrapAdminNeeded,
  issueAdminGrant,
  persistChallengerCertificate,
} from "./certificates";
import { recordEvent } from "./audit";
import { bindSsoIdentity } from "./sso";
import { actorPayload } from "./webhook-payloads";
import type { AuthCertificate } from "@prisma/client";
import { DuplicateEmailError } from "@/db/user.dao";

const logger = pino({ name: "user-login-channel" });
const Buffer = crypto.Buffer;

/**
 * How long an `AuthCertificate` row is good for, measured from `startedAt`.
 *
 * The row *is* the credential. `key` is what `authOptions`' credentials provider trades for a
 * session, and for a bootstrap login the `certRound.key` reachable through `listen` is what
 * co-signs `admin_console_access`. Nothing in the schema bounded either: a completed row that was
 * never consumed stayed redeemable indefinitely, so a `key` left in a browser's history, a proxy
 * log or a screenshot was a permanent way in rather than a momentary one.
 *
 * Ten minutes is far longer than any live attempt — `app/login/page.tsx` polls for three minutes
 * and then gives up on its own — and short enough that a leaked key is worthless by the time
 * anyone finds it. A row that expires mid-handshake just fails; the person retries and gets a new
 * one, which costs a QR scan.
 */
export const AUTH_CERTIFICATE_TTL_MS = 10 * 60 * 1000;

/** Whether this row is past {@link AUTH_CERTIFICATE_TTL_MS}. Every read path that could turn a
 *  row into a session, or advance a handshake toward one, goes through this. */
export function isAuthCertificateExpired(
  cert: Pick<AuthCertificate, "startedAt">,
  now: number = Date.now()
): boolean {
  return now - cert.startedAt.getTime() > AUTH_CERTIFICATE_TTL_MS;
}

/**
 * Expired rows are refused on read, so deleting them reclaims storage rather than withdrawing
 * access — which is why this runs opportunistically off the back of a login attempt instead of on
 * a timer. No process lifecycle to manage, nothing to leak if this module is loaded in a Next.js
 * route rather than the custom server, and two instances sweeping at once is a no-op rather than a
 * race. The throttle keeps a burst of logins from issuing one `deleteMany` each; if nobody ever
 * logs in again the leftovers are inert.
 */
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
let lastSweepAt = 0;

function sweepExpiredCertificates(): void {
  const now = Date.now();
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;
  void AuthCertificateDAO.deleteStartedBefore(new Date(now - AUTH_CERTIFICATE_TTL_MS))
    .then((count) => {
      if (count > 0) logger.info({ count }, "Swept expired login certificates");
    })
    .catch((err) => logger.warn({ err }, "Sweeping expired login certificates failed"));
}

/** The rejection a raced-out `withDeadline` produces. Distinguishable from a real transport
 *  failure, which must stay loud. */
const TIMEOUT = "p2p-timeout";

/**
 * Race `promise` against `ms`, clearing the timer either way.
 *
 * The clearing is not tidiness: without it a 120-second connect window leaves a pending timer per
 * abandoned QR code, which is a smaller version of the leak this whole bound exists to fix. The
 * `unref` keeps one from holding the process open at shutdown.
 */
function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(TIMEOUT)), ms);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

function isTimeout(err: unknown): boolean {
  return err instanceof Error && err.message === TIMEOUT;
}

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

/**
 * Redeeming an invite (packages/controlplane/CLAUDE.md "Human onboarding via invite"): unlike
 * packages/control-plane's equivalent, there's no pre-created placeholder row to claim — Actor.did
 * is this schema's primary key, so nothing human-shaped can exist before this handshake actually
 * completes. `InvitationDAO.findValidByToken` re-checks expiry/already-redeemed right here (not
 * just at the pre-flight `GET /api/public/invite/[token]` the redemption page calls before
 * starting the exchange) — closing the old package's flagged gap where a stale/reopened link could
 * silently mint an unrelated second account instead of failing loudly.
 */
async function registerHumanFromInvitation(
  did: string,
  publicKey: string,
  rawToken: string
): Promise<boolean> {
  const invitation = await InvitationDAO.findValidByToken(rawToken);
  if (!invitation) {
    logger.warn(
      { did },
      "Invitation redemption attempted with an invalid/expired/used token"
    );
    return false;
  }

  // The invitation carries an email, and `User.email` is unique — so an invitation written for an
  // address that already belongs to somebody cannot be redeemed into a second account. Checked
  // before creating anything, and the invitation is deliberately **not** consumed: the redeemer is
  // not at fault, and an admin can correct the address (or the existing human) and have the same
  // link keep working. Redeeming with the *same* DID that already holds the address is fine and
  // never reaches here — `ensureExists` returns the existing Actor.
  if (invitation.email) {
    const holder = await UserDAO.findByEmail(invitation.email);
    if (holder && holder.did !== did) {
      logger.warn(
        { did, invitedEmail: invitation.email, heldBy: holder.did },
        "Invitation redemption refused — its email address already belongs to another human"
      );
      return false;
    }
  }

  let actor: Awaited<ReturnType<typeof UserDAO.ensureExists>>;
  try {
    actor = await UserDAO.ensureExists(
      did,
      invitation.name,
      invitation.email,
      publicKey
    );
  } catch (err) {
    // Lost a race against a concurrent registration claiming the same address between the check
    // above and this write. Same outcome, same reasoning: fail the redemption, keep the invitation.
    if (err instanceof DuplicateEmailError) {
      logger.warn(
        { did, invitedEmail: invitation.email },
        "Invitation redemption lost an email race"
      );
      return false;
    }
    throw err;
  }
  await InvitationDAO.markRedeemed(invitation.tokenHash, did);

  // A binding invitation minted by an unbound SSO login (lib/sso.ts): now that a
  // DID exists, point the external identity at it so every later login through
  // that IdP is an ordinary DID session. A false return means the identity was
  // bound by a concurrent redemption — the Actor above still exists and is
  // usable, it just isn't reachable via SSO, which is the safe way to lose this
  // race rather than repointing an existing binding at a new DID.
  if (invitation.ssoIdentityId) {
    const bound = await bindSsoIdentity(invitation.ssoIdentityId, did);
    if (!bound) {
      logger.warn(
        { did, ssoIdentityId: invitation.ssoIdentityId },
        "SSO identity was already bound — leaving the existing binding in place"
      );
    }
  }
  // Already has a real name/email from the invite — skip the first-login profile-completion
  // prompt (app/welcome) entirely, unlike the plain self-registration path.
  await UserDAO.markProfileCompleted(did);

  const capabilities = invitation.capabilities as AgentCapability[];
  if (capabilities.length > 0) {
    await issueAdminGrant({
      agentDid: did,
      workspaceId: invitation.workspaceId,
      capabilities,
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
      issuedBy: invitation.createdBy,
    });
  }

  // No `performedBy` — this is the new human's own action, same convention as
  // `actor.registration_requested`. `invitedBy` records who set the invite up in the first place.
  await recordEvent({
    eventType: "human.invitation_redeemed",
    payload: { ...actorPayload(actor), invitedBy: invitation.createdBy },
    targetType: "actor",
    targetId: did,
  });

  logger.info(
    { did, invitedBy: invitation.createdBy },
    "Human onboarded via invitation"
  );
  return true;
}

async function registerHuman(
  contact: VaultysId,
  invitationToken?: string
): Promise<boolean> {
  const did = contact.toVersion(1).did;
  const publicKey = Buffer.from(contact.id).toString("base64");
  if (invitationToken)
    return registerHumanFromInvitation(did, publicKey, invitationToken);
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

async function handleSuccess(
  cert: MutableCert,
  challenger: Challenger
): Promise<LoginResult> {
  const contact = challenger.getContactId();
  const did = contact.toVersion(1).did;
  const meta = JSON.parse(cert.metadata ?? "{}") as Record<string, unknown>;
  const isNewRegistration = cert.register === 1;
  const invitationToken =
    typeof meta.invitationToken === "string" ? meta.invitationToken : undefined;

  const ok = isNewRegistration
    ? await registerHuman(contact, invitationToken)
    : await loginHuman(contact);
  if (ok) {
    meta.did = did;
    cert.metadata = JSON.stringify(meta);
  }
  return { ok, did, isNewRegistration };
}

export class UserLoginChannel {
  /** `invitationToken` (packages/controlplane/CLAUDE.md "Human onboarding via invite"), when
   *  given, rides along in the row's initial `metadata` — `handleSuccess`/the P2P early-completion
   *  branch both read it back out and thread it into `registerHuman` on completion. */
  static async createRegistrationCertificate(
    invitationToken?: string
  ): Promise<AuthCertificate> {
    sweepExpiredCertificates();
    const key = crypto.randomBytes(32).toString("hex");
    return AuthCertificateDAO.create({
      id: crypto.randomBytes(16).toString("hex"),
      key,
      registration: crypto
        .hash("sha256", Buffer.from(`vaultys-${key}-server`))
        .toString("hex"),
      connection: crypto
        .hash("sha256", Buffer.from(`connecting-${key}-vaultys`))
        .toString("hex"),
      register: 1,
      data: "",
      metadata: invitationToken
        ? JSON.stringify({ invitationToken })
        : undefined,
    });
  }

  static async createConnectionCertificate(): Promise<AuthCertificate> {
    sweepExpiredCertificates();
    const key = crypto.randomBytes(32).toString("hex");
    return AuthCertificateDAO.create({
      id: crypto.randomBytes(16).toString("hex"),
      key,
      registration: crypto
        .hash("sha256", Buffer.from(`vaultys-${key}-server`))
        .toString("hex"),
      connection: crypto
        .hash("sha256", Buffer.from(`connecting-${key}-vaultys`))
        .toString("hex"),
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
    const meta: CertRoundMeta = {
      kind: "certificate",
      humanDid,
      capabilities,
      certId,
      issuedBy,
    };
    return AuthCertificateDAO.create({
      id: crypto.randomBytes(16).toString("hex"),
      key,
      registration: crypto
        .hash("sha256", Buffer.from(`vaultys-${key}-server`))
        .toString("hex"),
      connection: crypto
        .hash("sha256", Buffer.from(`connecting-${key}-vaultys`))
        .toString("hex"),
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
   * the Node.js event loop until the wallet connects, the channel closes, or
   * `connectWindowMs` elapses with nobody having connected at all.
   *
   * That last bound is the reason this takes a parameter. PeerJS never signals
   * "nobody ever dialled in", so an unbounded first `receive()` meant every
   * abandoned QR code left this loop and its channel alive for the life of the
   * process. The caller passes the org's configured window
   * (`lib/login-window.ts`) rather than this reading it, because the route also
   * hands the same number to the browser to count down — one read, one value,
   * no chance of the page promising a window the server isn't keeping.
   */
  static async startP2PSession(
    cert: AuthCertificate,
    connectWindowMs: number
  ): Promise<string> {
    const { PeerjsChannel } = await import("@vaultys/channel-peerjs");

    const channel = new PeerjsChannel(cert.key, "initiator", "0.peerjs.com");
    const connectionString = channel.getConnectionString();

    void (async () => {
      const mutableCert: MutableCert = { ...cert };
      const deadline = Date.now() + connectWindowMs;
      const remainingMs = () => Math.max(0, deadline - Date.now());
      try {
        // `channel.start()` — not the first `receive()` — is what waits for a wallet to dial in,
        // and it is the await that never returned when none did. PeerJS has no "nobody connected"
        // signal, so the window is the only thing that ends it.
        try {
          await withDeadline(channel.start(), connectWindowMs);
        } catch (startErr) {
          if (!isTimeout(startErr)) throw startErr;
          // Nobody scanned the code. Ordinary and expected — info, not warn, or a busy login page
          // fills the log with one warning per abandoned tab.
          logger.info({ id: cert.id, connectWindowMs }, "P2P login window closed with no wallet");
          await AuthCertificateDAO.update(cert.id, { status: -2 });
          return;
        }
        const vid = await ServerIdentityDAO.getServerVaultysId();
        const challenger = new Challenger(vid);

        // Round-based exchange. Some wallet versions close the channel after a
        // single round (identity already proven at challenger.state === 1);
        // PeerJS doesn't signal that closure, so channel.receive() would hang
        // forever — race it against a short timeout and treat that specific
        // state as completion instead of a failure.
        for (let round = 0; round < 4; round++) {
          let walletCert: Uint8Array;
          // A wallet is connected by now, so these bound how long it may go quiet, not whether
          // anyone turned up. Round 0 keeps whatever is left of the connect window (never less
          // than a normal round) because the wallet is typically showing its owner an approval
          // prompt at this point, and a human reading a phone screen is slower than a protocol
          // round. Later rounds are machine-to-machine, and the 5s is also what detects the
          // wallets that close the channel after a single round (see above).
          const roundTimeoutMs = round === 0 ? Math.max(5_000, remainingMs()) : 5_000;
          try {
            walletCert = await withDeadline(channel.receive(), roundTimeoutMs);
          } catch (receiveErr) {
            const timedOut = isTimeout(receiveErr);
            if (
              timedOut &&
              challenger.state === 1 &&
              verifyProtocol(challenger)
            ) {
              const contactDid = challenger.getContactDid();
              const hisKeyRaw = (challenger as unknown as { hisKey: Buffer })
                .hisKey;
              if (contactDid && hisKeyRaw) {
                const contact = VaultysId.fromId(hisKeyRaw);
                const isNewRegistration = mutableCert.register === 1;
                const initialMeta = JSON.parse(
                  mutableCert.metadata ?? "{}"
                ) as Record<string, unknown>;
                const invitationToken =
                  typeof initialMeta.invitationToken === "string"
                    ? initialMeta.invitationToken
                    : undefined;
                const ok = await (isNewRegistration
                  ? registerHuman(contact, invitationToken)
                  : loginHuman(contact));
                // Idempotent and a no-op once any admin exists (isBootstrapAdminNeeded) — which is
                // guaranteed here anyway, since creating an invite in the first place requires
                // already being an authenticated admin.
                if (ok && isNewRegistration)
                  await ensureBootstrapAdmin(contactDid);
                mutableCert.metadata = JSON.stringify({ did: contactDid });
                await AuthCertificateDAO.update(cert.id, {
                  status: ok ? 2 : -2,
                  metadata: mutableCert.metadata,
                });
              } else {
                await AuthCertificateDAO.update(cert.id, { status: -2 });
              }
            } else if (timedOut && round === 0) {
              // A wallet connected and then said nothing at all. Unlike "nobody scanned", this is
              // worth a warning — something dialled in and abandoned the handshake.
              logger.warn({ id: cert.id }, "P2P peer connected but never opened the handshake");
              await AuthCertificateDAO.update(cert.id, { status: -2 });
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
            await AuthCertificateDAO.update(cert.id, {
              status: -2,
              data: mutableCert.data,
            });
            break;
          }
          if (!verifyProtocol(challenger)) {
            await AuthCertificateDAO.update(cert.id, {
              status: -2,
              data: mutableCert.data,
            });
            break;
          }
          if (challenger.isComplete()) {
            const result = await handleSuccess(mutableCert, challenger);
            if (result.ok && result.isNewRegistration)
              await ensureBootstrapAdmin(result.did);
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
    if (isAuthCertificateExpired(cert)) {
      // Marked failed rather than just refused, so the polling client is told immediately instead
      // of waiting out its own timeout on a row that can never complete.
      logger.warn({ id: cert.id }, "Challenger round on an expired login certificate");
      await AuthCertificateDAO.update(cert.id, { status: -2 });
      return new Uint8Array([0]);
    }

    const existingMeta = JSON.parse(
      cert.metadata ?? "{}"
    ) as Partial<CertRoundMeta>;
    if (existingMeta.kind === "certificate") {
      return UserLoginChannel.handleCertificateRequest(
        cert,
        existingMeta as CertRoundMeta,
        data
      );
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
      await AuthCertificateDAO.update(cert.id, {
        status: -2,
        data: mutableCert.data,
      });
      return new Uint8Array([0]);
    }

    if (challenger.isComplete()) {
      const result = await handleSuccess(mutableCert, challenger);
      if (!result.ok) {
        await AuthCertificateDAO.update(cert.id, {
          status: -2,
          data: mutableCert.data,
        });
        return new Uint8Array([0]);
      }
      if (result.isNewRegistration && (await isBootstrapAdminNeeded())) {
        const certRound = await UserLoginChannel.createCertificateRound(
          result.did,
          ["admin_console_access"],
          BOOTSTRAP_ADMIN_CERT_ID,
          "system:bootstrap"
        );
        const meta = JSON.parse(mutableCert.metadata ?? "{}") as Record<
          string,
          unknown
        >;
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
        ? ({ capabilities: JSON.stringify(meta.capabilities) } satisfies Record<
            string,
            string
          >)
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
        {
          certId: meta.certId,
          humanDid: meta.humanDid,
          granted: persisted !== null,
        },
        "Certificate round completed"
      );
    }

    await AuthCertificateDAO.update(cert.id, {
      status: challenger.state,
      data: dataB64,
    });
    return CryptoChannel.encrypt(certificate, uintkey);
  }

  /** The lookup `authOptions`' credentials provider makes before trading a key for a session —
   *  so this is the one that decides whether a stale key still logs somebody in. */
  static async connecting(key: string): Promise<AuthCertificate | null> {
    if (!key) return null;
    const cert = await AuthCertificateDAO.findByKey(key);
    if (!cert || isAuthCertificateExpired(cert)) return null;
    return cert;
  }

  /** An expired row reads as absent, which the route reports as status -1. The client has given
   *  up long before that — it polls for three minutes against a ten-minute TTL — and this way a
   *  stale `connection` token stops handing back the `certRound` key that co-signs the bootstrap
   *  admin grant. */
  static async listen(token: string): Promise<AuthCertificate | null> {
    if (!token) return null;
    const cert = await AuthCertificateDAO.findByConnection(token);
    if (!cert || isAuthCertificateExpired(cert)) return null;
    return cert;
  }

  static async consumeCertificate(key: string): Promise<boolean> {
    const cert = await AuthCertificateDAO.findByKey(key);
    if (!cert || !cert.connection || cert.status !== 2) return false;
    // Expired rows are deleted either way: the row is spent whether or not it was redeemable, and
    // leaving it behind would only wait for the sweep.
    const expired = isAuthCertificateExpired(cert);
    await AuthCertificateDAO.delete(cert.id);
    return !expired;
  }

  static async hasAnyHuman(): Promise<boolean> {
    return (await ActorDAO.count({ kind: "human" })) > 0;
  }
}
