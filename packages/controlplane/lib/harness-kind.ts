/**
 * The `harness` kind's `kindConfig` schema (docs/HARNESS_SUPERVISOR.md).
 *
 * A `harness` Actor is `vaultysclaw-sensor` running the **supervise** role: it
 * launches a coding harness — Claude Code today — and decides every tool call
 * locally from a signed grant and a signed rule set, with no control-plane round
 * trip.
 *
 * Sibling of `proxy` and deliberately shaped like it: same unsigned-in-the-DB
 * storage, same sign-at-push-time rule set, same `maxStatusAgeSeconds`
 * semantics. The two differ in exactly one thing — a proxy governs network
 * destinations and a harness governs resource URIs — which is why they carry
 * different halves of the same signed rule set (`ProxyRule` vs
 * `ProxyResourceRule`) rather than two rule formats.
 *
 * Storing the DB copy unsigned is the same deliberate choice as the proxy's: a
 * stored signature would have to be regenerated on every edit, and a stale one
 * is indistinguishable from a tampered one.
 */
import {
  PROXY_RULESET_VERSION,
  validateProxyRuleSet,
  proxyResourceRuleWarnings,
  type ProxyResourceRule,
} from "./proxy-rules";

/** How a decision is applied on the host (docs/HARNESS_SUPERVISOR.md §4, §5). */
export type HarnessMode = "observe" | "explicit";

/** Whether the host establishes tier-B OS confinement (§6). */
export type HarnessSandbox = "off" | "auto" | "require";

export interface HarnessKindConfig {
  /**
   * `observe`: every tool call is decided and recorded, and none are refused.
   *
   * `explicit`: anything no certificate covers is refused.
   *
   * Observe is the default and should stay the default for a while on any new
   * deployment. The resource strings a supervisor produces end up inside signed
   * certificates, and the honest way to learn what they look like is to watch
   * real sessions before freezing them — which is what `vaultysclaw-sensor
   * report` is for.
   */
  mode: HarnessMode;
  /**
   * Tier-B OS confinement.
   *
   * `require` is the setting for anyone who actually depends on it: the host
   * refuses to launch where confinement cannot be established, rather than
   * silently continuing in advisory mode. `auto` confines where it can and warns
   * loudly where it cannot. `off` never tries.
   *
   * Only macOS has a backend today, so `require` will refuse to launch on Linux
   * and Windows — deliberately, because the alternative is an operator who
   * believes they are confined and is not.
   */
  sandbox: HarnessSandbox;
  /**
   * Resource rules, signed as a set at push time.
   *
   * These are the harness half of the same signed rule set the proxy uses. A
   * `harness` config carries no host rules: a supervisor sees resource URIs and
   * never a destination, so a host rule pushed here could not match anything and
   * would read as protection that is not there.
   */
  resourceRules: ProxyResourceRule[];
  /**
   * How long an unrefreshed certificate status may back a decision.
   *
   * `0` is the strictest value — no cached status is acceptable, which for an
   * offline decider means denying every governed call under fail-closed.
   * Negative is unbounded. Identical to the proxy's field, and deliberately not
   * allowed to drift from it: one knob must not mean opposite things in two
   * roles of one binary.
   */
  maxStatusAgeSeconds: number;
}

/** What a freshly created harness Actor gets: observes everything, refuses nothing. */
export const DEFAULT_HARNESS_KIND_CONFIG: HarnessKindConfig = {
  mode: "observe",
  sandbox: "auto",
  resourceRules: [],
  // Unbounded, stated as a negative rather than left at 0 — a brand-new harness
  // has no status refresh to be fresh against, and 0 would deny everything the
  // moment it moved to `explicit`.
  maxStatusAgeSeconds: -1,
};

export class HarnessKindConfigError extends Error {}

/**
 * Parse and validate a stored `kindConfig`.
 *
 * Throws rather than falling back to defaults. A malformed stored config that
 * silently became the default would drop every deny rule an admin wrote and
 * replace `explicit` with `observe` — turning enforcement off through a parse
 * error nobody sees.
 */
export function parseHarnessKindConfig(raw: unknown): HarnessKindConfig {
  if (raw === null || raw === undefined) return { ...DEFAULT_HARNESS_KIND_CONFIG };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new HarnessKindConfigError("kindConfig must be an object");
  }
  const o = raw as Record<string, unknown>;

  const mode = o.mode ?? DEFAULT_HARNESS_KIND_CONFIG.mode;
  if (mode !== "observe" && mode !== "explicit") {
    throw new HarnessKindConfigError(`mode must be "observe" or "explicit" (got ${JSON.stringify(mode)})`);
  }

  const sandbox = o.sandbox ?? DEFAULT_HARNESS_KIND_CONFIG.sandbox;
  if (sandbox !== "off" && sandbox !== "auto" && sandbox !== "require") {
    throw new HarnessKindConfigError(
      `sandbox must be "off", "auto" or "require" (got ${JSON.stringify(sandbox)})`
    );
  }

  const maxStatusAgeSeconds = o.maxStatusAgeSeconds ?? DEFAULT_HARNESS_KIND_CONFIG.maxStatusAgeSeconds;
  if (typeof maxStatusAgeSeconds !== "number" || !Number.isFinite(maxStatusAgeSeconds)) {
    throw new HarnessKindConfigError(
      `maxStatusAgeSeconds must be a number (got ${JSON.stringify(maxStatusAgeSeconds)})`
    );
  }

  const rawRules = o.resourceRules ?? [];
  if (!Array.isArray(rawRules)) {
    throw new HarnessKindConfigError("resourceRules must be an array");
  }
  const resourceRules = rawRules as ProxyResourceRule[];

  // Validated through the same function that validates a set before signing, so
  // a config that stores cleanly can never be one the signer later refuses —
  // which would leave an admin with a saved policy that silently never ships.
  try {
    validateProxyRuleSet({
      version: PROXY_RULESET_VERSION,
      issuedAt: Date.now(),
      rules: [],
      resourceRules,
    });
  } catch (err) {
    throw new HarnessKindConfigError(err instanceof Error ? err.message : String(err));
  }

  return { mode, sandbox, resourceRules, maxStatusAgeSeconds };
}

/**
 * Author-time warnings: things that are legal, storable and signable, but that
 * mean less than they look like they mean.
 *
 * Warnings rather than errors throughout. Each of these is a configuration a
 * competent admin might want on purpose, and refusing to save it would be
 * wrong — but every one of them also produces a deployment that looks governed
 * and is not, which is the failure this whole design is organized against.
 */
export function harnessKindConfigWarnings(config: HarnessKindConfig): string[] {
  const warnings: string[] = [];

  if (config.mode === "observe") {
    warnings.push(
      "Mode is `observe`: every tool call is decided and recorded, and none are refused. " +
        "This is the right setting while you learn what your sessions actually touch — read " +
        "`vaultysclaw-sensor report` — but nothing is being enforced."
    );
  }

  if (config.sandbox === "off") {
    warnings.push(
      "OS confinement is off, so supervision is advisory: the hook governs tool calls the harness " +
        "routes through it, but a subprocess or an edited harness config bypasses it entirely."
    );
  }

  if (config.maxStatusAgeSeconds < 0) {
    warnings.push(
      "maxStatusAgeSeconds is negative (unbounded): a revoked certificate keeps authorizing tool " +
        "calls on this host for as long as it goes without a status refresh."
    );
  } else if (config.maxStatusAgeSeconds === 0 && config.mode === "explicit") {
    warnings.push(
      "maxStatusAgeSeconds is 0, the strictest setting — no cached status is acceptable. An " +
        "offline decider cannot perform the live check that demands, so under fail-closed every " +
        "governed tool call will be denied."
    );
  }

  if (config.resourceRules.length === 0) {
    warnings.push(
      "No resource rules: nothing here can deny a path outright, so every call is decided by the " +
        "certificate alone, plus whatever local safety floor the host is configured with."
    );
  }

  const subjectScoped = config.resourceRules.filter((r) => r.subject !== "any");
  if (subjectScoped.length > 0) {
    // The supervisor loads its rule set with attribution unavailable, and the Go
    // verifier refuses the *whole set* in that case rather than letting a rule
    // silently never match. So this is not a rule that will be ignored — it is
    // a set that will not load, taking every other rule down with it.
    warnings.push(
      `${subjectScoped.length} rule(s) are subject-scoped (${subjectScoped
        .map((r) => r.id)
        .join(", ")}). A harness supervisor has no workload attribution, so it will refuse the ` +
        "entire rule set at load rather than let those rules silently never match — including the " +
        'rules that would have worked. Use subject "any".'
    );
  }

  warnings.push(...proxyResourceRuleWarnings({
    version: PROXY_RULESET_VERSION,
    issuedAt: Date.now(),
    rules: [],
    resourceRules: config.resourceRules,
  }));

  return warnings;
}
