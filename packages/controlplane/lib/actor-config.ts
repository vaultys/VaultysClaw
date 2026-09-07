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
import {
  CapabilityCertificateDAO,
  ActorDAO,
  ServerIdentityDAO,
  SettingsDAO,
  CustomCapabilityDAO,
} from "@/db";
import { isCustomCapability } from "@vaultysclaw/policy";
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
import { signCert } from "@vaultysclaw/policy";
import {
  harnessKindConfigWarnings,
  parseHarnessKindConfig,
  type HarnessKindConfig,
} from "./harness-kind";
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
 * Returns null only when the Actor does not exist.
 *
 * Every kind gets a payload, because the `trust` block is meaningful to all of them: a client that
 * re-checks its certificate status needs to know the org's fail mode and how stale a stapled status
 * may be (docs/CUSTOM_CAPABILITIES.md Phase 3). Before that, this message was proxy-only and the
 * org-wide `trust.stapleTtlSeconds` an admin edits under Settings reached nothing at all.
 *
 * Only the two **enforcing** kinds — `proxy` and `harness` — get a
 * `kindConfig`/`ruleSetToken`/`grantToken`. Those are offline enforcement inputs and mean nothing to
 * a kind that only reports.
 */
export async function buildActorConfig(did: string): Promise<ActorConfigResult | null> {
  const actor = await ActorDAO.findByDid(did);
  if (!actor) return null;

  const warnings: string[] = [];

  if (actor.kind === "harness") {
    return buildHarnessConfig(did, actor.kindConfig, warnings);
  }

  if (actor.kind !== "proxy") {
    return {
      payload: {
        kindConfig: {},
        // Signed for shape consistency even though it carries nothing: a
        // recipient should never have to special-case "this kind sends no
        // token" against "this deployment cannot sign", which look identical
        // from the other end.
        kindConfigToken: await signKindConfig({}),
        // A non-proxy client already holds its own certificate from `cert_issued`; it doesn't need
        // a second copy to know what it was granted, and it doesn't enforce on anyone else's
        // behalf, so there is nothing for a grant token to authorize here.
        grantToken: null,
        ruleSetToken: null,
        trust: await resolveOrgTrust(),
      },
      warnings,
    };
  }

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
    payload: {
      kindConfig,
      kindConfigToken: await signKindConfig(kindConfig),
      grantToken,
      ruleSetToken,
      trust,
    },
    warnings,
  };
}

/**
 * Sign a kindConfig so a recipient can act on it in either direction.
 *
 * Same envelope as the grant and the rule set — `signCert` over the object, verified offline
 * against the pinned anchor. Nothing about the content changes; what changes is that the recipient
 * can tell an admin's decision from anyone else's, which is the whole difference between a
 * configuration channel and a suggestion channel.
 */
async function signKindConfig(kindConfig: unknown): Promise<string> {
  const vid = await ServerIdentityDAO.getServerVaultysId();
  return signCert(vid, kindConfig as Record<string, unknown>);
}

/**
 * The `harness` half of buildActorConfig (docs/HARNESS_SUPERVISOR.md §8 phase 5).
 *
 * Structurally the proxy's twin, and separate rather than parameterised: the two
 * kinds share the shape of their payload and nothing else about their meaning,
 * and one function branching on kind throughout would read as though they were
 * variations of a single thing. They are two interception points that happen to
 * be provisioned the same way.
 */
async function buildHarnessConfig(
  did: string,
  raw: unknown,
  warnings: string[]
): Promise<ActorConfigResult> {
  let kindConfig: HarnessKindConfig;
  try {
    kindConfig = parseHarnessKindConfig(raw);
  } catch (err) {
    // Same refusal as the proxy's, for the same reason: a malformed stored
    // config silently becoming the default would drop every deny rule the admin
    // wrote *and* replace `explicit` with `observe`, turning enforcement off
    // through a parse error nobody sees.
    throw new Error(
      `actor-config: ${did}'s kindConfig is invalid and cannot be pushed: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  const grantToken = await resolveGrantToken(did, warnings);
  const ruleSetToken = await signHarnessRuleSet(kindConfig);
  warnings.push(...harnessKindConfigWarnings(kindConfig));

  return {
    payload: {
      kindConfig,
      kindConfigToken: await signKindConfig(kindConfig),
      grantToken,
      ruleSetToken,
      // The harness's own maxStatusAgeSeconds is authoritative for it, exactly as
      // the proxy's is for the proxy: an offline decider cannot perform the live
      // query `trust.stapleTtlSeconds` describes, so the value is translated at
      // the push rather than copied.
      trust: await resolveTrustFrom(kindConfig.maxStatusAgeSeconds),
    },
    warnings,
  };
}

/** Sign the resource-rule set from a harness config, or null when there are no rules. */
async function signHarnessRuleSet(config: HarnessKindConfig): Promise<string | null> {
  if (config.resourceRules.length === 0) return null;

  const vid = await ServerIdentityDAO.getServerVaultysId();
  return signProxyRuleSet(vid, {
    version: PROXY_RULESET_VERSION,
    // No host rules: a supervisor sees resource URIs and never a destination, so
    // a host rule pushed here could not match anything and would read as
    // protection that is not there.
    rules: [],
    resourceRules: config.resourceRules,
    issuedAt: Date.now(),
  });
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

  // A stale custom capability can't be filtered out of a packcert the way it can out of a
  // `cert_status_response`: the capability list here is *inside* the signature, so removing a name
  // would mean re-minting the certificate under a new id. Rather than push a grant that asserts,
  // to an offline verifier, a capability the registry has deleted — the one place where fail-closed
  // would otherwise silently not hold — withhold it and say why. The same shape as the
  // challenger-format refusal above: no authority, and a warning an admin actually sees.
  const stale = await staleCustomCapabilities(verifiable.capabilities as string[]);
  if (stale.length > 0) {
    warnings.push(
      `This proxy's certificate grants ${stale.join(", ")}, which ${
        stale.length === 1 ? "is" : "are"
      } no longer in the custom-capability registry. ` +
        `Its capabilities are baked into the signature and cannot be filtered, so the grant is withheld and the proxy will refuse every governed request. ` +
        `Re-add the capability, or revoke this certificate and issue a replacement.`
    );
    return null;
  }

  return verifiable.certificate;
}

/**
 * Which of these capabilities are custom names the registry no longer knows about.
 *
 * Skips the DB round-trip entirely for the common case of a certificate carrying only built-ins.
 */
async function staleCustomCapabilities(capabilities: string[]): Promise<string[]> {
  const custom = capabilities.filter(isCustomCapability);
  if (custom.length === 0) return [];
  const known = new Set(await CustomCapabilityDAO.listNames());
  return custom.filter((c) => !known.has(c));
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
 * `trust.stapleTtlSeconds` does **not** map *for this kind*, and this is the one place that
 * mismatch is handled — see `resolveOrgTrust` below for every other kind, where it does map. Its 0 means "force a live status query every time"
 * (`CERTIFICATE_WEB_OF_TRUST.md` §5.2) — the strictest option — and an
 * interception point deciding offline cannot query anything. Inheriting the
 * number would either hand the loosest behaviour to the admin who asked for the
 * strictest, or make every proxy deny everything by default. So the proxy's own
 * `maxStatusAgeSeconds` is authoritative for this kind, and the org-wide staple
 * TTL is deliberately not consulted here (it is, for other kinds).
 */
async function resolveTrust(config: ProxyKindConfig): Promise<ActorConfigPayload["trust"]> {
  return resolveTrustFrom(config.maxStatusAgeSeconds);
}

/**
 * The trust block for an interception point that decides offline, from its own
 * configured staleness bound.
 *
 * Shared by both enforcing kinds because the reasoning is identical and must not
 * drift: an offline decider cannot perform the live query `stapleTtlSeconds: 0`
 * describes, so its own number is authoritative and is translated at the push
 * rather than copied from the org setting.
 */
async function resolveTrustFrom(maxStatusAgeSeconds: number): Promise<ActorConfigPayload["trust"]> {
  return {
    failClosed: await resolveFailClosed(),
    maxStatusAgeSeconds,
  };
}

/**
 * The trust block for every kind that is **not** a proxy.
 *
 * Here the org-wide `trust.stapleTtlSeconds` maps directly, and its 0 keeps its strict meaning:
 * "force a live status query every time" is something an online client genuinely can do, unlike an
 * interception point deciding offline (which is the whole reason the proxy kind carries its own
 * number instead — see `resolveTrust` above). A negative value stays unbounded, and has to be
 * written explicitly to mean that, so it can never be reached by omission.
 */
async function resolveOrgTrust(): Promise<ActorConfigPayload["trust"]> {
  const raw = await SettingsDAO.get(SETTINGS_KEYS.trustStapleTtlSeconds);
  const parsed = raw === null || raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
  return {
    failClosed: await resolveFailClosed(),
    maxStatusAgeSeconds: Number.isFinite(parsed) ? parsed : DEFAULT_STAPLE_TTL_SECONDS,
  };
}

async function resolveFailClosed(): Promise<boolean> {
  const failMode = (await SettingsDAO.get(SETTINGS_KEYS.trustFailMode)) ?? DEFAULT_TRUST_FAIL_MODE;
  return failMode !== "open";
}
