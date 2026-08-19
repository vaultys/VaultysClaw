/**
 * The two Challenger exchanges an Actor runs against the control plane.
 *
 * Both use protocol `"p2p"`; they differ only in `service`:
 *
 * - `"auth"`       — proves identity when the connection opens.
 * - `"certificate"`— issues a capability certificate, started by the control
 *                    plane after an admin approves (trust doc §3.2b).
 *
 * The client is the **initiator** (`pk1`) in both. The control plane hard-rejects
 * a certificate exchange whose service string is anything other than
 * `"certificate"`.
 */

import { Challenger, VaultysId, crypto } from "@vaultys/id";

const Buf = crypto.Buffer;

export type HandshakeService = "auth" | "certificate";

/**
 * One side of a Challenger exchange, wrapping the base64 encode/decode the wire
 * format needs.
 *
 * `Challenger.update()` **throws** on a malformed or tampered round rather than
 * only flipping `hasFailed()`, so every call here is wrapped and surfaced as a
 * typed failure instead of an unhandled rejection.
 */
export class Handshake {
  private readonly challenger: Challenger;

  constructor(vaultysId: VaultysId) {
    this.challenger = new Challenger(vaultysId.toVersion(1));
  }

  /**
   * Begin as the initiating side, returning the first base64 round to send.
   *
   * Version 0 matches every other client in this system (the browser dev-mode
   * path and the Go SDK alike); it is the challenge format version, distinct
   * from the identity's own `toVersion(1)`.
   */
  start(service: HandshakeService): string {
    this.challenger.createChallenge("p2p", service, 0);
    return this.certificateBase64();
  }

  /**
   * Process an incoming base64 round.
   *
   * Returns the next round to send, or `null` when this side has nothing further
   * to send (either finished — check `isComplete()` — or waiting on the peer).
   */
  async accept(dataBase64: string): Promise<string | null> {
    try {
      await this.challenger.update(Buf.from(dataBase64, "base64"));
    } catch (err) {
      throw new HandshakeError(err instanceof Error ? err.message : String(err));
    }
    if (this.challenger.hasFailed()) {
      throw new HandshakeError(this.challenger.challenge?.error ?? "Challenge failed");
    }
    return this.certificateBase64();
  }

  isComplete(): boolean {
    return this.challenger.isComplete();
  }

  /** The service string actually negotiated — verify it rather than assuming. */
  service(): string | undefined {
    return this.challenger.getContext().service;
  }

  /**
   * The peer's identity. Only available once complete — `getContactId()` throws
   * before that, which is exactly why the trailing `auth_challenge` round after
   * `auth_complete` must not be skipped on the reconnect path.
   */
  contactId(): VaultysId {
    return this.challenger.getContactId().toVersion(1);
  }

  contactDid(): string | null {
    return this.challenger.getContactDid();
  }

  /** The current certificate bytes, base64. Empty string when there is nothing to send. */
  certificateBase64(): string {
    const cert = this.challenger.getCertificate();
    if (!cert || cert.length === 0) return "";
    return Buf.from(cert).toString("base64");
  }
}

export class HandshakeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HandshakeError";
  }
}
