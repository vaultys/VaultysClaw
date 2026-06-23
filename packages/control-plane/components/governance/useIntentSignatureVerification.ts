import { useState, useEffect } from "react";
import type { AuditEntryDetail, AuditCertInfo } from "@/lib/contracts";

export type SigState = "idle" | "verifying" | "valid" | "invalid" | "no_key";

/**
 * Browser-side ECDSA verification of an intent signature against the agent's
 * certificate public key (pk1). Also computes a SHA-256 fingerprint of the
 * signed token for display. Returns the verification state and hash.
 */
export function useIntentSignatureVerification(
  entry: AuditEntryDetail | null,
  certInfo: AuditCertInfo | null
) {
  const [sigState, setSigState] = useState<SigState>("idle");
  const [sigHash, setSigHash] = useState<string | null>(null);

  useEffect(() => {
    if (!entry || entry.source !== "intent" || !entry.intentSignature) return;
    setSigState("verifying");

    (async () => {
      try {
        const tokenB64 = entry.intentSignature!;

        // ── Compute SHA-256 fingerprint (display only) ──────────────────────
        const rawBytes = Uint8Array.from(atob(tokenB64), (c) =>
          c.charCodeAt(0)
        );
        const hashBuf = await crypto.subtle.digest("SHA-256", rawBytes);
        const hashHex = Array.from(new Uint8Array(hashBuf))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        setSigHash(hashHex);

        // ── Verify ECDSA signature ──────────────────────────────────────────
        const pk1Bytes = certInfo?.pk1Bytes;
        if (!pk1Bytes) {
          setSigState("no_key");
          return;
        }

        // Parse wire format: 4-byte LE bodyLen | msgpack(body) | raw-sig
        const combined = rawBytes;
        if (combined.length < 5) {
          setSigState("invalid");
          return;
        }
        const bodyLen =
          combined[0] |
          (combined[1] << 8) |
          (combined[2] << 16) |
          (combined[3] << 24);
        if (combined.length < 4 + bodyLen) {
          setSigState("invalid");
          return;
        }
        const body = combined.slice(4, 4 + bodyLen);
        const sig = combined.slice(4 + bodyLen);
        if (sig.length === 0) {
          setSigState("invalid");
          return;
        }

        // Decode body and cross-check fields
        const { decode: msgpackDecode } = await import("@msgpack/msgpack");
        const payload = msgpackDecode(body) as Record<string, unknown>;
        const intentId = entry.id.startsWith("int-")
          ? entry.id.slice(4)
          : entry.id;
        if (
          payload.type !== "intent" ||
          payload.id !== intentId ||
          payload.agentId !== entry.agentDid
        ) {
          setSigState("invalid");
          return;
        }

        // Cryptographic verification via @vaultys/id browser bundle
        const { VaultysId, crypto: vid_crypto } = await import("@vaultys/id");
        const pk1Buf = vid_crypto.Buffer.from(pk1Bytes, "base64");
        const vid = VaultysId.fromId(pk1Buf);
        const ok = await vid.verifyChallenge(
          vid_crypto.Buffer.from(body),
          vid_crypto.Buffer.from(sig),
          false
        );
        setSigState(ok ? "valid" : "invalid");
      } catch {
        setSigState("invalid");
      }
    })();
  }, [entry, certInfo?.pk1Bytes]);

  return { sigState, sigHash };
}
