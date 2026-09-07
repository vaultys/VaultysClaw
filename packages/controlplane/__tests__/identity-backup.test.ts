import { describe, expect, it } from "vitest";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  IdentityBackupError,
  MIN_PASSPHRASE_LENGTH,
  backupFilename,
  createBackup,
  openBackup,
  parseBackup,
} from "@/lib/identity-backup";
import type { BrowserIdData } from "@/lib/browser-identity";

/**
 * These run against the real Web Crypto implementation (available as
 * `globalThis.crypto` in Node), not a mock — a backup format is exactly the kind
 * of thing where a mocked round trip proves nothing, because the failure mode is
 * "the file cannot be decrypted six months later on a different machine".
 */

const PASSPHRASE = "correct horse battery";

const identities: BrowserIdData[] = [
  { did: "did:vaultys:00aa", vid: "cHVi", secret: "c2Vjcm90", type: "software" },
  { did: "did:vaultys:00bb", vid: "cHViMg", secret: "c2VjcmV0Mg", type: "software-pqc" },
];

describe("createBackup / openBackup", () => {
  it("round-trips identities through a real encrypt/decrypt", async () => {
    const backup = await createBackup(identities, PASSPHRASE);
    expect(await openBackup(backup, PASSPHRASE)).toEqual(identities);
  });

  it("produces an envelope that leaks nothing but a count", async () => {
    const backup = await createBackup(identities, PASSPHRASE);
    const serialised = JSON.stringify(backup);

    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.version).toBe(BACKUP_VERSION);
    expect(backup.identityCount).toBe(2);

    // The whole point of encrypting: neither a DID nor a secret may appear in
    // the file. A DID is public, but which identities one person holds is a
    // linkage the file should not hand to whoever finds it.
    for (const i of identities) {
      expect(serialised).not.toContain(i.did);
      expect(serialised).not.toContain(i.secret);
    }
  });

  it("uses a fresh salt and IV each time, so two backups never match", async () => {
    // Reusing an IV under the same derived key is a catastrophic AES-GCM
    // failure, and identical files would be the visible symptom.
    const a = await createBackup(identities, PASSPHRASE);
    const b = await createBackup(identities, PASSPHRASE);
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
    expect(a.cipher.iv).not.toBe(b.cipher.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("rejects a wrong passphrase without saying the file is otherwise fine", async () => {
    const backup = await createBackup(identities, PASSPHRASE);
    await expect(openBackup(backup, "not the passphrase")).rejects.toThrow(IdentityBackupError);
    await expect(openBackup(backup, "not the passphrase")).rejects.toThrow(
      /Wrong passphrase, or this backup file has been altered/
    );
  });

  it("rejects a tampered ciphertext with the same message as a wrong passphrase", async () => {
    // AES-GCM cannot tell the two apart, and neither should the message —
    // distinguishing them would confirm to whoever holds the file which of the
    // two they are dealing with.
    const backup = await createBackup(identities, PASSPHRASE);
    const flipped = [...atob(backup.ciphertext)];
    flipped[4] = String.fromCharCode(flipped[4].charCodeAt(0) ^ 0xff);
    const tampered = { ...backup, ciphertext: btoa(flipped.join("")) };

    await expect(openBackup(tampered, PASSPHRASE)).rejects.toThrow(
      /Wrong passphrase, or this backup file has been altered/
    );
  });

  it("rejects a passphrase shorter than the minimum", async () => {
    await expect(createBackup(identities, "short")).rejects.toThrow(
      new RegExp(`at least ${MIN_PASSPHRASE_LENGTH} characters`)
    );
    // Exactly at the boundary is accepted.
    await expect(createBackup(identities, "a".repeat(MIN_PASSPHRASE_LENGTH))).resolves.toBeDefined();
  });

  it("refuses to back up nothing", async () => {
    // A zero-identity "backup" is a file that looks like insurance and is not.
    await expect(createBackup([], PASSPHRASE)).rejects.toThrow(/no identities/i);
  });

  it("survives a JSON round trip, which is how the file is actually used", async () => {
    const backup = await createBackup(identities, PASSPHRASE);
    const reloaded = parseBackup(JSON.stringify(backup, null, 2));
    expect(await openBackup(reloaded, PASSPHRASE)).toEqual(identities);
  });
});

describe("parseBackup", () => {
  it("rejects files that are not backups", () => {
    expect(() => parseBackup("not json at all")).toThrow(/invalid JSON/);
    expect(() => parseBackup(JSON.stringify({ hello: "world" }))).toThrow(/not a VaultysClaw/);
  });

  it("refuses a version this build does not know rather than guessing", async () => {
    const backup = await createBackup(identities, PASSPHRASE);
    expect(() => parseBackup(JSON.stringify({ ...backup, version: 99 }))).toThrow(/version 99/);
  });

  it("rejects an envelope missing its encryption parameters", async () => {
    const backup = await createBackup(identities, PASSPHRASE);
    for (const drop of ["ciphertext", "kdf", "cipher"] as const) {
      const broken = { ...backup, [drop]: undefined };
      expect(() => parseBackup(JSON.stringify(broken))).toThrow(IdentityBackupError);
    }
  });

  it("rejects an unsupported algorithm rather than attempting it", async () => {
    const backup = await createBackup(identities, PASSPHRASE);
    const swapped = { ...backup, cipher: { ...backup.cipher, name: "AES-CBC" } };
    expect(() => parseBackup(JSON.stringify(swapped))).toThrow(/algorithm this build does not support/);
  });

  it("rejects a nonsensical iteration count", async () => {
    const backup = await createBackup(identities, PASSPHRASE);
    // A zero-iteration KDF would derive a key almost instantly — the shape of an
    // attempt to make an offline guess cheap.
    const weakened = { ...backup, kdf: { ...backup.kdf, iterations: 0 } };
    expect(() => parseBackup(JSON.stringify(weakened))).toThrow(/invalid iteration count/);
  });
});

describe("openBackup contents validation", () => {
  it("refuses the whole restore when an entry has no did, key, or secret", async () => {
    // Validated before anything is written back: a half-applied restore is
    // harder to reason about than a refused one.
    const backup = await createBackup(
      [identities[0], { did: "did:vaultys:00cc", vid: "x" } as BrowserIdData],
      PASSPHRASE
    );
    await expect(openBackup(backup, PASSPHRASE)).rejects.toThrow(
      /Identity 2 .* missing its did, public key, or secret/
    );
  });

  it("restores an identity stored before `type` existed", async () => {
    // Regression: a real backup of four identities failed outright because two
    // predated the multi-type work and carry no `type`. That field is a display
    // hint the connect path never reads, so refusing over it lost real keys for a
    // cosmetic reason — the worst possible trade for a backup feature.
    const legacyShaped = [
      { did: "did:vaultys:00old", vid: "cHVi", secret: "c2VjcmV0" },
      identities[1],
    ] as BrowserIdData[];

    const backup = await createBackup(legacyShaped, PASSPHRASE);
    const restored = await openBackup(backup, PASSPHRASE);

    expect(restored).toHaveLength(2);
    // Normalised on the way out, so nothing downstream sees the loose shape.
    expect(restored[0].type).toBe("software");
    expect(restored[0].secret).toBe("c2VjcmV0");
    expect(restored[1].type).toBe("software-pqc");
  });
});

describe("backupFilename", () => {
  it("names the file by date so backups sort and are identifiable", () => {
    expect(backupFilename(new Date("2026-08-06T12:00:00Z"))).toBe(
      "vaultysclaw-identities-2026-08-06.json"
    );
  });
});
