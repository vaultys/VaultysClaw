/**
 * The fleet mesh: how one member proves to another that a message is from it *and* that it is
 * still allowed to send it. Pure — the transport is `main.ts`'s in-memory radio.
 *
 * A message is signed with the sender's own VaultysId and carries the sender's latest
 * control-plane-signed `cert_status_response` (the staple). A recipient accepts it only if every
 * check below passes, using nothing but the control plane's public key from its *own* handshake:
 * no shared fleet secret, and no call home on the hot path. That is what makes revocation reach a
 * peer that never talks to the control plane about the sender — and what bounds it: a sender
 * cut off by revocation is believed until its last active staple is older than the TTL.
 */
import { VaultysId } from "@vaultys/id";
import {
  decodeCertUnsafe,
  openCert,
  signCert,
  verifyCertStatusResponseCert,
  type CertStatusResponseBody,
} from "@vaultysclaw/policy";

export interface FleetMessageBody {
  type: "fleet_msg";
  id: string;
  from: string;
  /** The sender's public VaultysId, base64 — what the signature is checked against, and what the
   *  `from` DID must derive from. */
  publicId: string;
  messageType: string;
  payload: Record<string, unknown>;
  sentAt: number;
  staple: string | null;
}

export type CheckName =
  | "signature"
  | "identity"
  | "freshness"
  | "replay"
  | "audience"
  | "proof"
  | "proof-signature"
  | "proof-subject"
  | "proof-age"
  | "status"
  | "capability";

export interface Verdict {
  accepted: boolean;
  /** The check that decided — the failing one, or "capability" when everything passed. */
  check: CheckName;
  reason: string;
  from?: string;
  messageType?: string;
  /** Age of the sender's staple at verification time, when there was a readable one. */
  stapleAgeMs?: number;
}

export async function signFleetMessage(
  vid: VaultysId,
  input: Omit<FleetMessageBody, "type" | "publicId" | "from"> & { from?: string }
): Promise<string> {
  const body: FleetMessageBody = {
    type: "fleet_msg",
    id: input.id,
    from: input.from ?? vid.did,
    publicId: Buffer.from(vid.id).toString("base64"),
    messageType: input.messageType,
    payload: input.payload,
    sentAt: input.sentAt,
    staple: input.staple,
  };
  return signCert(vid, body);
}

export interface VerifyOptions {
  /** The capability the sender must hold for this message — or a list, any one of which will do. */
  requirement: string | readonly string[];
  /** Staple TTL: a proof older than this says nothing about now, so it is refused. */
  stapleTtlMs: number;
  /** How old a message may be before it counts as a replay. */
  maxMessageAgeMs: number;
  now?: number;
  /** The recipient's own DID, for messages that name one (`payload.target`, as orders do). Without
   *  it, a genuine order captured on its way to one drone is a valid order for every other drone
   *  until it ages out. */
  audience?: string;
  /** Message ids this recipient has already accepted — an exact replay inside the window. */
  seen?: { has(id: string): boolean; add(id: string): unknown };
}

const deny = (check: CheckName, reason: string, extra: Partial<Verdict> = {}): Verdict => ({
  accepted: false,
  check,
  reason,
  ...extra,
});

export function verifyFleetMessage(
  controlPlane: VaultysId,
  token: string,
  opts: VerifyOptions
): Verdict {
  const now = opts.now ?? Date.now();
  const claimed = decodeCertUnsafe(token) as Partial<FleetMessageBody> | null;
  if (!claimed || claimed.type !== "fleet_msg" || typeof claimed.publicId !== "string") {
    return deny("signature", "Message illisible");
  }
  let sender: VaultysId;
  try {
    sender = VaultysId.fromId(Buffer.from(claimed.publicId, "base64") as never).toVersion(1);
  } catch {
    return deny("signature", "Clé publique de l'émetteur invalide");
  }
  const body = openCert(sender, token) as FleetMessageBody | null;
  if (!body) return deny("signature", "Signature invalide");
  const extra = { from: body.from, messageType: body.messageType };

  if (sender.did !== body.from) {
    return deny("identity", "Usurpation d'identité : la signature n'est pas celle de l'émetteur annoncé", extra);
  }
  if (now - body.sentAt > opts.maxMessageAgeMs || body.sentAt - now > opts.maxMessageAgeMs) {
    return deny("freshness", "Message rejoué ou hors délai", extra);
  }
  if (opts.seen?.has(body.id)) return deny("replay", "Message déjà reçu (rejeu)", extra);
  if (opts.audience && body.payload?.target !== opts.audience) {
    return deny("audience", "Ordre destiné à un autre acteur (rejeu détourné)", extra);
  }
  if (!body.staple) return deny("proof", "Aucune preuve d'autorisation jointe", extra);

  const proof: CertStatusResponseBody | null = verifyCertStatusResponseCert(controlPlane, body.staple);
  if (!proof) {
    return deny("proof-signature", "Preuve falsifiée : non signée par le plan de contrôle", extra);
  }
  if (proof.agentDid !== body.from) {
    return deny("proof-subject", "Preuve appartenant à un autre acteur", extra);
  }
  const stapleAgeMs = now - proof.checkedAt;
  if (stapleAgeMs > opts.stapleTtlMs) {
    return deny(
      "proof-age",
      `Preuve expirée (${Math.round(stapleAgeMs / 1000)} s > TTL ${Math.round(opts.stapleTtlMs / 1000)} s) — refus par défaut`,
      { ...extra, stapleAgeMs }
    );
  }
  if (proof.status !== "active") {
    return deny("status", `Certificat ${proof.status === "revoked" ? "révoqué" : proof.status}`, { ...extra, stapleAgeMs });
  }
  const accepted = typeof opts.requirement === "string" ? [opts.requirement] : opts.requirement;
  if (!accepted.some((r) => (proof.capabilities as string[]).includes(r))) {
    const names = accepted.map((r) => `« ${r} »`).join(" ou ");
    return deny("capability", `Non autorisé : ${names} absent du certificat`, { ...extra, stapleAgeMs });
  }
  opts.seen?.add(body.id);
  return { accepted: true, check: "capability", reason: "Accepté", ...extra, stapleAgeMs };
}

/** Read a staple without verifying it — display only, never a decision. */
export function peekStaple(staple: string | null): CertStatusResponseBody | null {
  if (!staple) return null;
  const body = decodeCertUnsafe(staple) as CertStatusResponseBody | null;
  return body?.type === "cert_status_response" ? body : null;
}

/**
 * What an attacker holding the drone's key — but not the control plane's — can produce: a
 * well-formed status response granting itself whatever it likes, signed with a key that is not
 * the control plane's. Exists to be refused.
 */
export function forgeStaple(
  attacker: VaultysId,
  agentDid: string,
  certId: string,
  capabilities: string[]
): Promise<string> {
  const forged: CertStatusResponseBody = {
    type: "cert_status_response",
    certId,
    agentDid,
    status: "active",
    capabilities: capabilities as CertStatusResponseBody["capabilities"],
    resourceLimits: null,
    scope: null,
    checkedAt: Date.now(),
    expiresAt: null,
  };
  return signCert(attacker, forged);
}
