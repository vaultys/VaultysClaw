/**
 * Passphrase-encrypted backup and restore for the dev-mode VaultysIDs this
 * browser holds in `localStorage` (`lib/browser-connect.ts`).
 *
 * # What this can and cannot back up
 *
 * Only dev-mode identities. A real wallet identity's secret never reaches the
 * control plane or the browser at all — the wallet app holds it and only ever
 * sends signed challenge responses over the pairing channel. There is nothing
 * here to export for one, and a backup feature that implied otherwise would be
 * actively misleading about where the key lives.
 *
 * # Why the backup is always encrypted
 *
 * `BrowserIdData.secret` *is* the private key. A backup is by definition a file
 * that gets put somewhere and forgotten about — a sync folder, a Downloads
 * directory, an email to oneself — so writing a raw private key into one is a
 * different risk from holding it in `localStorage`, where it is at least bound
 * to an origin. There is deliberately no "export unencrypted" path: anyone who
 * genuinely wants the raw value can already read it from devtools, and offering
 * it here would make the unsafe option the convenient one.
 *
 * PBKDF2-SHA256 at 600k iterations (the OWASP 2023 figure) derives an AES-GCM
 * key. GCM authenticates, so a wrong passphrase and a tampered file are the same
 * failure — which is what we want: fail closed, one message, no oracle for
 * distinguishing the two.
 */
import { normaliseIdentity, type BrowserIdData } from "./browser-identity";

export const BACKUP_FORMAT = "vaultysclaw-identity-backup";
export const BACKUP_VERSION = 1;

/**
 * PBKDF2 iterations. High enough to make a weak passphrase costly to attack
 * offline, low enough that deriving once in a browser stays sub-second.
 */
const KDF_ITERATIONS = 600_000;

/**
 * The shortest passphrase this will accept.
 *
 * A KDF cannot rescue a four-character passphrase — 600k iterations multiplies
 * the cost of each guess, but the guess space is what actually bounds an
 * attacker. Refusing outright beats accepting one and calling the file
 * "encrypted".
 */
export const MIN_PASSPHRASE_LENGTH = 8;

export interface IdentityBackup {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  /**
   * How many identities are inside. Deliberately the only thing about the
   * contents that is readable without the passphrase — enough to tell two backup
   * files apart, while the DIDs themselves stay encrypted. A DID is a public
   * identifier, but a list of which identities one person holds is a linkage the
   * file does not need to leak to whoever finds it.
   */
  identityCount: number;
  kdf: { name: "PBKDF2"; hash: "SHA-256"; iterations: number; salt: string };
  cipher: { name: "AES-GCM"; iv: string };
  ciphertext: string;
}

export class IdentityBackupError extends Error {}


const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

// Return types inferred, not annotated `Uint8Array`. A bare `Uint8Array` means
// `Uint8Array<ArrayBufferLike>`, which is *not* assignable to WebCrypto's `BufferSource`
// (`ArrayBufferView<ArrayBuffer> | ArrayBuffer`) under the DOM lib — which is why these values used
// to need casts at every call site. Inference yields `Uint8Array<ArrayBuffer>` here, so the casts
// are unnecessary and the file compiles for Node consumers too, where `BufferSource` is not in
// scope at all.
function fromBase64(value: string) {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Additional authenticated data: the format and version.
 *
 * Binds the ciphertext to the envelope it arrived in, so a future v2 file whose
 * body means something else cannot be decrypted as a v1 one by an older build
 * that would then misread it.
 */
function aad(version: number) {
  return encoder.encode(`${BACKUP_FORMAT}/v${version}`);
}

// Return type inferred rather than annotated `Promise<CryptoKey>`: `CryptoKey`, like
// `BufferSource`, is a DOM-lib global, and this module has to compile for Node consumers too.
// Inference picks up whatever the ambient WebCrypto type is in each environment.
// `Uint8Array<ArrayBuffer>`, not a bare `Uint8Array`: the latter widens to
// `Uint8Array<ArrayBufferLike>`, which admits `SharedArrayBuffer` and so is not assignable to
// WebCrypto's `BufferSource`. Every caller already passes a plain-buffer array.
async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const base = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return globalThis.crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** Encrypt `identities` under `passphrase`. Throws IdentityBackupError on a passphrase that is too short or a set that is empty. */
export async function createBackup(
  identities: BrowserIdData[],
  passphrase: string
): Promise<IdentityBackup> {
  if (identities.length === 0) {
    throw new IdentityBackupError("There are no identities in this browser to back up.");
  }
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new IdentityBackupError(
      `Use a passphrase of at least ${MIN_PASSPHRASE_LENGTH} characters — this file contains private keys.`
    );
  }

  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, KDF_ITERATIONS);

  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv, additionalData: aad(BACKUP_VERSION) },
    key,
    encoder.encode(JSON.stringify(identities))
  );

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    identityCount: identities.length,
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations: KDF_ITERATIONS, salt: toBase64(salt) },
    cipher: { name: "AES-GCM", iv: toBase64(iv) },
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

/** Parse a file's text into a backup envelope, rejecting anything that is not one. */
export function parseBackup(text: string): IdentityBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new IdentityBackupError("That file is not a VaultysClaw identity backup (invalid JSON).");
  }

  const b = raw as Partial<IdentityBackup>;
  if (b?.format !== BACKUP_FORMAT) {
    throw new IdentityBackupError("That file is not a VaultysClaw identity backup.");
  }
  if (b.version !== BACKUP_VERSION) {
    // Never attempt a best-effort decrypt of a version this build does not know:
    // the AAD would reject it anyway, and a clear message beats a confusing
    // "wrong passphrase".
    throw new IdentityBackupError(
      `This backup is version ${b.version}, and this build only reads version ${BACKUP_VERSION}.`
    );
  }
  if (!b.kdf?.salt || !b.cipher?.iv || !b.ciphertext) {
    throw new IdentityBackupError("This backup file is missing its encryption parameters.");
  }
  if (b.kdf.name !== "PBKDF2" || b.kdf.hash !== "SHA-256" || b.cipher.name !== "AES-GCM") {
    throw new IdentityBackupError("This backup uses an algorithm this build does not support.");
  }
  if (!Number.isInteger(b.kdf.iterations) || b.kdf.iterations < 1) {
    throw new IdentityBackupError("This backup declares an invalid iteration count.");
  }
  return b as IdentityBackup;
}

/**
 * Decrypt a backup.
 *
 * A wrong passphrase and a tampered file both surface as the same error, because
 * AES-GCM cannot distinguish them and neither should this: reporting "the file
 * is intact but your passphrase is wrong" would confirm a guessed passphrase's
 * failure mode to whoever holds the file.
 */
export async function openBackup(
  backup: IdentityBackup,
  passphrase: string
): Promise<BrowserIdData[]> {
  const key = await deriveKey(passphrase, fromBase64(backup.kdf.salt), backup.kdf.iterations);

  let plaintext: ArrayBuffer;
  try {
    plaintext = await globalThis.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromBase64(backup.cipher.iv),
        additionalData: aad(backup.version),
      },
      key,
      fromBase64(backup.ciphertext)
    );
  } catch {
    throw new IdentityBackupError("Wrong passphrase, or this backup file has been altered.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(plaintext));
  } catch {
    throw new IdentityBackupError("This backup decrypted but its contents are not readable.");
  }
  if (!Array.isArray(parsed)) {
    throw new IdentityBackupError("This backup decrypted but does not contain an identity list.");
  }

  // Validate every entry before any of them is written back: a partially-applied
  // restore is harder to reason about than a refused one.
  //
  // `type` is deliberately *not* required. It is a display hint — the picker's
  // icon and label — and nothing in the connect path reads it, so an identity
  // that predates the field is perfectly usable. An earlier version of this
  // check demanded it and refused real backups outright over a cosmetic field,
  // which is the wrong trade for the one feature whose entire job is not losing
  // keys. `did`/`vid`/`secret` stay required: those *are* the identity.
  return parsed.map((entry, i) => {
    const e = entry as Partial<BrowserIdData>;
    if (!e?.did || !e.vid || !e.secret) {
      throw new IdentityBackupError(
        `Identity ${i + 1} in this backup is missing its did, public key, or secret.`
      );
    }
    return normaliseIdentity(e);
  });
}

/** A filename that sorts by date and says what the file is without opening it. */
export function backupFilename(now = new Date()): string {
  return `vaultysclaw-identities-${now.toISOString().slice(0, 10)}.json`;
}
