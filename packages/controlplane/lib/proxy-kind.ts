/**
 * The `proxy` kind's `kindConfig` schema
 * (docs/REBUILD_ARCHITECTURE.md §4.3, docs/PROXY_ARCHITECTURE.md §12).
 *
 * Stored as plain authorable JSON on `Actor.kindConfig`; the signature that
 * makes it enforceable is produced at push time from the server identity (see
 * `lib/actor-config.ts`). Keeping the DB copy unsigned is deliberate — a stored
 * signature would have to be regenerated on every edit, and a stale one is
 * indistinguishable from a tampered one.
 */
import { PROXY_RULESET_VERSION, validateProxyRuleSet, type ProxyRule } from "./proxy-rules";

/** How traffic reaches the interception point (docs/PROXY_ARCHITECTURE.md §4). */
export type ProxyMode = "explicit" | "system";

export interface ProxyKindConfig {
  /**
   * `explicit`: agents are configured to point at the proxy, so everything
   * arriving is agent traffic by construction and no attribution is needed
   * (§5.2.3).
   *
   * `system`: the host's proxy settings point here, so the proxy sees *all*
   * traffic and needs §5.2's scope machinery to avoid governing the browser and
   * the package manager. Not implemented — the agent refuses to start in this
   * mode rather than half-supporting it.
   */
  mode: ProxyMode;
  /** Informational: where the agent binds. Authoritative value lives in the agent's own config. */
  listenAddr?: string;
  /** §5.2 rules. Signed as a set at push time. */
  rules: ProxyRule[];
  /**
   * How long an unrefreshed certificate status may back a decision.
   *
   * `0` is the strictest value — no cached status is acceptable, which for an
   * offline decider means denying every governed request under fail-closed.
   * Negative is unbounded. See `ActorConfigPayload.trust` on why this is not
   * simply `trust.stapleTtlSeconds`.
   */
  maxStatusAgeSeconds: number;
}

/** What a freshly created proxy Actor gets: governs nothing, refuses nothing, enforces via its certificate only. */
export const DEFAULT_PROXY_KIND_CONFIG: ProxyKindConfig = {
  mode: "explicit",
  rules: [],
  // Unbounded, stated as a negative rather than left at 0. A brand-new proxy
  // has no status refresh to be fresh against, and 0 would deny everything —
  // the admin panel surfaces this as the choice it is.
  maxStatusAgeSeconds: -1,
};

export class ProxyKindConfigError extends Error {}

/**
 * Parse and validate an `Actor.kindConfig` JSON blob.
 *
 * Tolerant of a missing or empty config — a proxy that has never been
 * configured is a valid state, and it enforces its certificate alone. Not
 * tolerant of a malformed one: an unparseable rule would otherwise be dropped
 * silently, and a dropped `deny` rule widens access.
 */
export function parseProxyKindConfig(raw: unknown): ProxyKindConfig {
  if (raw === null || raw === undefined) return { ...DEFAULT_PROXY_KIND_CONFIG };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new ProxyKindConfigError("kindConfig must be an object");
  }

  const obj = raw as Record<string, unknown>;
  if (Object.keys(obj).length === 0) return { ...DEFAULT_PROXY_KIND_CONFIG };

  const mode = obj.mode ?? DEFAULT_PROXY_KIND_CONFIG.mode;
  if (mode !== "explicit" && mode !== "system") {
    throw new ProxyKindConfigError(`mode must be "explicit" or "system" (got ${JSON.stringify(mode)})`);
  }

  const rawAge = obj.maxStatusAgeSeconds ?? DEFAULT_PROXY_KIND_CONFIG.maxStatusAgeSeconds;
  if (typeof rawAge !== "number" || !Number.isInteger(rawAge)) {
    throw new ProxyKindConfigError(`maxStatusAgeSeconds must be an integer (got ${JSON.stringify(rawAge)})`);
  }

  const rules = (obj.rules ?? []) as ProxyRule[];
  if (!Array.isArray(rules)) {
    throw new ProxyKindConfigError("rules must be an array");
  }
  // Validate through the same path that will sign it, so an admin cannot store
  // a config that fails at push time — when the failure would be a silent
  // fleet-wide loss of the whole rule set rather than a form error.
  validateProxyRuleSet({ version: PROXY_RULESET_VERSION, rules, issuedAt: Date.now() });

  const config: ProxyKindConfig = { mode, rules, maxStatusAgeSeconds: rawAge };
  if (typeof obj.listenAddr === "string" && obj.listenAddr.trim() !== "") {
    config.listenAddr = obj.listenAddr.trim();
  }
  return config;
}

/**
 * Warnings that are not errors: the config is valid and storable, but will not
 * do what its author probably expects. Surfaced in the admin panel rather than
 * blocking a save, because both cases are legitimate mid-configuration states.
 */
export function proxyKindConfigWarnings(config: ProxyKindConfig): string[] {
  const warnings: string[] = [];

  if (config.mode === "explicit") {
    const scoped = config.rules.filter((r) => r.subject === "agent" || r.subject === "workload");
    if (scoped.length > 0) {
      // The agent refuses to load such a set in explicit mode (§5.2.3), so this
      // is not a subtlety — the proxy will fail to start.
      warnings.push(
        `${scoped.length} rule(s) target a subject (${scoped.map((r) => r.id).join(", ")}), but this proxy is in "explicit" mode, ` +
          `which has no way to tell which process made a request. The agent will refuse to load this rule set rather than let those rules silently never match.`
      );
    }
  }

  if (config.mode === "system") {
    warnings.push(
      `"system" mode is not implemented yet — it needs the attribution and workload-scope machinery of ` +
        `docs/PROXY_ARCHITECTURE.md §5.2, without which it would govern all host traffic, not just agents. The agent will refuse to start.`
    );
  }

  if (config.maxStatusAgeSeconds === 0) {
    warnings.push(
      `maxStatusAgeSeconds is 0, the strictest setting: no cached certificate status is acceptable. ` +
        `An interception point decides offline and cannot perform a live status check, so with fail-closed it will deny every governed request.`
    );
  } else if (config.maxStatusAgeSeconds < 0) {
    warnings.push(
      `maxStatusAgeSeconds is negative (unbounded): a revoked certificate keeps working on this host for as long as it stays unrefreshed.`
    );
  }

  return warnings;
}
