/**
 * Builds the `actor_config` payload pushed to a connected Actor
 * (docs/PROXY_ARCHITECTURE.md §12).
 *
 * The push is a *delivery mechanism*, not a trust path. Everything
 * authorization-bearing in the payload is a token this module signs, and the
 * recipient verifies it offline against the control plane's public key — so a
 * compromised or spoofed transport cannot change what an interception point
 * enforces. That is the structural correction to the superseded proxy
 * implementation, which wrote whatever arrived on its socket into a local
 * database and enforced it (§9).
 *
 * A consequence worth keeping in mind when reading this file: an interception
 * point provisioned entirely from local files behaves identically to one that
 * received a push, because both go through the same verification. The push saves
 * an operator a manual step; it does not confer any authority the files lacked.
 */
import { CapabilityCertificateDAO, ActorDAO, ServerIdentityDAO, SettingsDAO } from "@/db";
import {
  DEFAULT_STAPLE_TTL_SECONDS,
  DEFAULT_TRUST_FAIL_MODE,
  SETTINGS_KEYS,
} from "./org-settings";
import {
  parseProxyKindConfig,
  proxyKindConfigWarnings,
  type ProxyKindConfig,
} from "./proxy-kind";
import { PROXY_RULESET_VERSION, signProxyRuleSet } from "./proxy-rules";
import type { ActorConfigPayload } from "./protocol";

/**
 * `certFormat` values whose signed bytes actually carry what was granted.
 *
 * Only `packcert` qualifies. A `challenger`-format certificate deliberately
 * carries no signed metadata — a Go-side Challenger verification bug makes
 * non-empty signed metadata unverifiable, so capabilities travel as a plain
 * adjacent field (see `CertIssuedPayload`'s doc comment). It therefore proves
 * live mutual presence, not *what* was granted, and cannot back a third-party
 * authorization decision (§8.1). Silently sending one would give an interception
 * point a token it must reject, and the reason would be invisible here.
 */
const VERIFIABLE_CERT_FORMAT = "packcert";

export interface ActorConfigResult {
  payload: ActorConfigPayload;
  /**
   * Non-fatal problems an admin needs to see: a proxy whose only certificate is
   * challenger-format, or one holding no certificate at all. Both produce a
   * valid payload that enforces nothing, which is exactly the state that looks
   * identical to a working one.
   */
  warnings: string[];
}

/**
 * Build the `actor_config` payload for an Actor.
 *
 * Returns null when the Actor does not exist, or is of a kind that has no
 * configuration to push — there is nothing to say to an `openclaw` or `sensor`
 * Actor through this message yet.
 */
export async function buildActorConfig(did: string): Promise<ActorConfigResult | null> {
  const actor = await ActorDAO.findByDid(did);
  if (!actor || actor.kind !== "proxy") return null;

  const warnings: string[] = [];

  let kindConfig: ProxyKindConfig;
  try {
    kindConfig = parseProxyKindConfig(actor.kindConfig);
  } catch (err) {
    // A malformed stored config must not silently become an empty one: that
    // would drop every deny rule the admin wrote. Refuse to build a payload.
    throw new Error(
      `actor-config: ${did}'s kindConfig is invalid and cannot be pushed: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  const grantToken = await resolveGrantToken(did, warnings);
  const ruleSetToken = await signRuleSet(kindConfig);
  const trust = await resolveTrust(kindConfig);

  // Config-shaped warnings come from one place — `proxyKindConfigWarnings` — so
  // this function and the admin panel cannot drift into two differently-worded
  // versions of the same problem. (They did: the panel rendered both, which read
  // as two distinct issues.) What is added here is only what a stored config
  // cannot reveal by itself, i.e. the certificate state above.
  warnings.push(...proxyKindConfigWarnings(kindConfig));

  return {
    payload: { kindConfig, grantToken, ruleSetToken, trust },
    warnings,
  };
}

/**
 * Pick the certificate an interception point will enforce on.
 *
 * Active, packcert-format, newest first — `CapabilityCertificateDAO.list`
 * already orders by `issuedAt desc`. Only one is sent: `resolvePermission` takes
 * a set, but an interception point's authority is its own single grant, and
 * sending several would make "which one authorized this" ambiguous in the audit
 * trail for no gain.
 */
async function resolveGrantToken(did: string, warnings: string[]): Promise<string | null> {
  const active = await CapabilityCertificateDAO.list({ agentDid: did, status: "active" });
  if (active.length === 0) {
    warnings.push(
      "This proxy holds no active certificate, so it will refuse every governed request. Issue one before pointing agents at it."
    );
    return null;
  }

  const verifiable = active.find((c) => c.certFormat === VERIFIABLE_CERT_FORMAT);
  if (!verifiable) {
    warnings.push(
      `This proxy's active certificate(s) are ${active
        .map((c) => c.certFormat)
        .join(", ")} format, which carry no signed capability metadata and cannot be re-verified offline. ` +
        `Issue a ${VERIFIABLE_CERT_FORMAT} grant instead — until then the proxy will refuse every governed request.`
    );
    return null;
  }

  return verifiable.certificate;
}

/** Sign the rule set from the stored config, or null when there are no rules. */
async function signRuleSet(config: ProxyKindConfig): Promise<string | null> {
  if (config.rules.length === 0) return null;

  const vid = await ServerIdentityDAO.getServerVaultysId();
  return signProxyRuleSet(vid, {
    version: PROXY_RULESET_VERSION,
    rules: config.rules,
    // The recipient measures nothing from this — it exists so an admin reading a
    // spooled decision can tell which generation of the rule set produced it.
    issuedAt: Date.now(),
  });
}

/**
 * Resolve the trust block, translating org settings rather than copying them.
 *
 * `trust.failMode` maps cleanly: `closed` → `failClosed: true`.
 *
 * `trust.stapleTtlSeconds` does **not** map, and this is the one place that
 * mismatch is handled. Its 0 means "force a live status query every time"
 * (`CERTIFICATE_WEB_OF_TRUST.md` §5.2) — the strictest option — and an
 * interception point deciding offline cannot query anything. Inheriting the
 * number would either hand the loosest behaviour to the admin who asked for the
 * strictest, or make every proxy deny everything by default. So the proxy's own
 * `maxStatusAgeSeconds` is authoritative for this kind, and the org-wide staple
 * TTL is deliberately not consulted here.
 */
async function resolveTrust(config: ProxyKindConfig): Promise<ActorConfigPayload["trust"]> {
  const failMode = (await SettingsDAO.get(SETTINGS_KEYS.trustFailMode)) ?? DEFAULT_TRUST_FAIL_MODE;
  void DEFAULT_STAPLE_TTL_SECONDS; // referenced by the doc comment above, deliberately unused
  return {
    failClosed: failMode !== "open",
    maxStatusAgeSeconds: config.maxStatusAgeSeconds,
  };
}
