/**
 * Signed rule sets for `kind: "proxy"` Actors
 * (docs/PROXY_ARCHITECTURE.md §5.2, §5.2.0).
 *
 * # Why rules are signed
 *
 * A certificate says what an interception point may permit. Some policy is not
 * expressible that way — "nothing on this host may reach openai.com" is a
 * destination rule, not a capability grant, and it must hold for every process
 * whether or not a classifier ever identified it. That makes a rule set a
 * *policy source*, and the central flaw of the superseded proxy implementation
 * (§9) was exactly that authorization arrived as unsigned pushed config the
 * proxy believed because it came over the socket.
 *
 * So a rule set travels in the same `signCert` envelope as a capability grant,
 * and the interception point verifies it offline against the control plane's
 * public key. The transport stops needing to be trusted.
 *
 * # Wire compatibility is a hard contract
 *
 * The consumer is Go: `vaultysclaw-sensor/internal/rules`. Its msgpack struct
 * tags are the authority for every key name here, and
 * `conformance/rules-fixture.json` pins the agreement — a rule set signed by
 * this module is verified by that package's test suite. Renaming a field on
 * either side without the other is a silent enforcement failure: a rule the
 * proxy cannot decode is a rule that does not apply.
 */
import type { VaultysId } from "@vaultys/id";
import { signCert } from "@vaultysclaw/policy";

/**
 * Whom a rule applies to.
 *
 * `any` is decidable from the destination alone and therefore cannot be evaded
 * by evading classification. `agent` and `workload` need to know which process
 * made the request, which only a host running the observe role alongside the
 * intercept role can answer (§5).
 */
export type ProxyRuleSubject = "any" | "agent" | "workload";

/** What a matching rule does. `deny` wins over `allow` whenever both match. */
export type ProxyRuleEffect = "deny" | "allow";

export interface ProxyRule {
  id: string;
  subject: ProxyRuleSubject;
  /** Required for `subject: "workload"`, omitted otherwise. */
  workloadId?: string;
  /**
   * Destination patterns. Two forms only, matching the Go verifier's
   * `MatchHost`: an exact hostname, or a dot-prefixed suffix like
   * `.openai.com` (which matches `api.openai.com` but not `openai.com`).
   *
   * Deliberately *not* substring matching, which the detector's own host
   * matching does use. Loose matching is right for a confidence heuristic and
   * wrong for enforcement in both directions: an allow rule for
   * `api.openai.com` would match the attacker-controlled
   * `api.openai.com.evil.example`, and a deny rule for `openai.com` would match
   * the unrelated `notopenai.com`.
   */
  hosts: string[];
  /** Destination ports; omit or leave empty for any port. */
  ports?: number[];
  effect: ProxyRuleEffect;
}

/**
 * A rule about a *resource URI* rather than a network destination —
 * `file:///Users/fx/.ssh/*`, `exec://docker`, `mcp://jira/delete`.
 *
 * A separate type from {@link ProxyRule}, and a separate list on the set,
 * because the two are evaluated by different interception points against
 * different inputs: the tier-1 proxy has a host and port and no URI, the
 * harness supervisor has a URI and no host. One type with two optional halves
 * would leave every reader branching on which half is populated, and would admit
 * a rule with both — whose meaning nobody has defined. One signed set still
 * carries both, so an admin's policy stays a single artefact.
 *
 * The Go twin is `rules.ResourceRule`; `resourceRules` is `omitempty` there, so
 * a set carrying none encodes exactly as it did before this existed.
 */
export interface ProxyResourceRule {
  id: string;
  subject: ProxyRuleSubject;
  /** Required for `subject: "workload"`, omitted otherwise. */
  workloadId?: string;
  /**
   * Resource URI patterns. Two forms only, matching the Go verifier's
   * `MatchResource`: an exact URI, or a prefix ending in `/*` meaning that path
   * and everything beneath it (the path itself included).
   *
   * Stricter than `CertScope.resourcePattern`, which allows a `*` anywhere.
   * That looseness is tolerable for a scope, which only ever grants; a rule's
   * `allow` effect bypasses the certificate entirely, so `file:///a/b*` — which
   * would authorize the sibling `file:///a/bc` — is refused rather than
   * interpreted.
   */
  resources: string[];
  effect: ProxyRuleEffect;
}

export interface ProxyRuleSet {
  version: number;
  rules: ProxyRule[];
  /** Resource-URI rules; omit or leave empty for a network-only set. */
  resourceRules?: ProxyResourceRule[];
  /** Ms since epoch. */
  issuedAt: number;
}

/** The only rule-set version this control plane emits. */
export const PROXY_RULESET_VERSION = 1;

export class ProxyRuleValidationError extends Error {}

/**
 * Reject a rule set the Go verifier would refuse, at authoring time.
 *
 * The verifier rejects a structurally invalid rule rather than skipping it,
 * because silently dropping a `deny` rule would widen access — so an invalid
 * rule here means the *whole* set fails to load on every host, taking the valid
 * rules down with it. Catching it before signing turns a fleet-wide enforcement
 * outage into a form error.
 */
export function validateProxyRuleSet(set: ProxyRuleSet): void {
  if (set.version !== PROXY_RULESET_VERSION) {
    throw new ProxyRuleValidationError(
      `rule set version must be ${PROXY_RULESET_VERSION} (got ${set.version})`
    );
  }

  const seen = new Set<string>();
  for (const [i, rule] of set.rules.entries()) {
    const where = `rule ${i} (${rule.id || "unnamed"})`;

    if (!rule.id.trim()) {
      throw new ProxyRuleValidationError(`${where} has no id — audit records reference rules by id`);
    }
    if (seen.has(rule.id)) {
      throw new ProxyRuleValidationError(`${where} duplicates an earlier rule id`);
    }
    seen.add(rule.id);

    if (rule.effect !== "deny" && rule.effect !== "allow") {
      throw new ProxyRuleValidationError(`${where} has an unknown effect ${JSON.stringify(rule.effect)}`);
    }
    if (rule.subject !== "any" && rule.subject !== "agent" && rule.subject !== "workload") {
      throw new ProxyRuleValidationError(`${where} has an unknown subject ${JSON.stringify(rule.subject)}`);
    }
    if (rule.subject === "workload" && !rule.workloadId?.trim()) {
      throw new ProxyRuleValidationError(`${where} has subject "workload" but no workloadId`);
    }
    if (rule.subject !== "workload" && rule.workloadId) {
      throw new ProxyRuleValidationError(
        `${where} sets workloadId but its subject is "${rule.subject}" — the field would be ignored, which reads as narrower than it is`
      );
    }

    if (rule.hosts.length === 0) {
      throw new ProxyRuleValidationError(`${where} matches no hosts`);
    }
    for (const host of rule.hosts) {
      const h = host.trim();
      if (h === "" || h === ".") {
        throw new ProxyRuleValidationError(`${where} has an empty host pattern`);
      }
      if (h.includes("*")) {
        throw new ProxyRuleValidationError(
          `${where} host ${JSON.stringify(host)} uses a wildcard; the verifier matches exact hostnames or dot-prefixed suffixes only (e.g. ".openai.com")`
        );
      }
      if (h.includes("/") || h.includes(":")) {
        throw new ProxyRuleValidationError(
          `${where} host ${JSON.stringify(host)} looks like a URL or host:port; use a bare hostname and the ports field`
        );
      }
    }

    for (const port of rule.ports ?? []) {
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new ProxyRuleValidationError(`${where} has an invalid port ${port}`);
      }
    }
  }

  // Resource rule ids share the namespace with host rule ids: an audit record
  // names a rule by id alone, so two rules answering to one id would make the
  // trail ambiguous about which fired.
  for (const [i, rule] of (set.resourceRules ?? []).entries()) {
    const where = `resource rule ${i} (${rule.id || "unnamed"})`;

    if (!rule.id.trim()) {
      throw new ProxyRuleValidationError(`${where} has no id — audit records reference rules by id`);
    }
    if (seen.has(rule.id)) {
      throw new ProxyRuleValidationError(`${where} duplicates an earlier rule id`);
    }
    seen.add(rule.id);

    if (rule.effect !== "deny" && rule.effect !== "allow") {
      throw new ProxyRuleValidationError(`${where} has an unknown effect ${JSON.stringify(rule.effect)}`);
    }
    if (rule.subject !== "any" && rule.subject !== "agent" && rule.subject !== "workload") {
      throw new ProxyRuleValidationError(`${where} has an unknown subject ${JSON.stringify(rule.subject)}`);
    }
    if (rule.subject === "workload" && !rule.workloadId?.trim()) {
      throw new ProxyRuleValidationError(`${where} has subject "workload" but no workloadId`);
    }
    if (rule.subject !== "workload" && rule.workloadId) {
      throw new ProxyRuleValidationError(
        `${where} sets workloadId but its subject is "${rule.subject}" — the field would be ignored, which reads as narrower than it is`
      );
    }
    if (rule.resources.length === 0) {
      throw new ProxyRuleValidationError(`${where} matches no resources`);
    }
    for (const resource of rule.resources) {
      validateResourcePattern(where, resource);
    }
  }
}

/**
 * Reject a resource pattern the Go matcher would read differently from how it
 * looks. Every rejection here mirrors `checkResourcePattern` in `sdk-go/rules`;
 * the two disagreeing means a set this control plane signs is one the verifier
 * refuses to load, taking every other rule in it down too.
 */
function validateResourcePattern(where: string, pattern: string): void {
  if (pattern.trim() === "") {
    throw new ProxyRuleValidationError(`${where} has an empty resource pattern`);
  }
  if (pattern.trim() !== pattern) {
    throw new ProxyRuleValidationError(
      `${where} resource ${JSON.stringify(pattern)} has surrounding whitespace, which would never match`
    );
  }
  if (!pattern.includes("://")) {
    throw new ProxyRuleValidationError(
      `${where} resource ${JSON.stringify(pattern)} is not a URI — expected a scheme like file:// or exec://`
    );
  }
  if (pattern.includes("*")) {
    if (!pattern.endsWith("/*") || (pattern.match(/\*/g) ?? []).length !== 1) {
      throw new ProxyRuleValidationError(
        `${where} resource ${JSON.stringify(pattern)} uses a wildcard other than a single trailing "/*" — ` +
          `the verifier matches an exact URI, or a prefix ending in "/*" meaning that path and everything beneath it`
      );
    }
    if (pattern.endsWith("://*")) {
      throw new ProxyRuleValidationError(
        `${where} resource ${JSON.stringify(pattern)} matches every resource of its scheme; scope it or omit the rule`
      );
    }
  }
}

/**
 * msgpack-encode and sign a rule set with the control plane's identity.
 *
 * Optional fields are omitted rather than sent as null: the Go structs use
 * `omitempty` and decode a missing key to a zero value, but an explicit null
 * where a string is expected is a decode error — which would fail the whole set.
 */
export async function signProxyRuleSet(vid: VaultysId, set: ProxyRuleSet): Promise<string> {
  validateProxyRuleSet(set);

  const payload = {
    version: set.version,
    issuedAt: set.issuedAt,
    rules: set.rules.map((rule) => ({
      id: rule.id,
      subject: rule.subject,
      ...(rule.workloadId ? { workloadId: rule.workloadId } : {}),
      hosts: rule.hosts,
      ...(rule.ports && rule.ports.length > 0 ? { ports: rule.ports } : {}),
      effect: rule.effect,
    })),
    // Omitted entirely when empty, not sent as an empty array: the Go field is
    // `omitempty`, so a network-only set must encode byte-identically to one
    // signed before resource rules existed — which is what keeps the existing
    // conformance fixture verifying unchanged.
    ...(set.resourceRules && set.resourceRules.length > 0
      ? {
          resourceRules: set.resourceRules.map((rule) => ({
            id: rule.id,
            subject: rule.subject,
            ...(rule.workloadId ? { workloadId: rule.workloadId } : {}),
            resources: rule.resources,
            effect: rule.effect,
          })),
        }
      : {}),
  };

  return signCert(vid, payload);
}

/**
 * Whether a rule set can be enforced on a deployment with no attribution
 * source.
 *
 * `explicit` mode has none — every caller was pointed at the proxy
 * deliberately, so there is nothing to resolve (§5.2.3). A subject-scoped rule
 * there can never match, and the Go verifier refuses the whole set at load
 * rather than failing open on every request while an admin believes it is
 * enforcing. Checking here lets the admin UI say so before signing.
 */
/**
 * Symlinked directory roots whose unresolved form silently matches nothing.
 *
 * On macOS `/etc`, `/var` and `/tmp` are all symlinks into `/private`, and the
 * interception point canonicalizes every resource before comparing — which is
 * what stops `../` and symlink escapes from defeating a scope. The consequence
 * is that a rule written as `file:///etc/*` covers nothing on a Mac, with no
 * error anywhere: it verifies, it loads, it matches no call.
 */
const SYMLINKED_ROOTS = ["/etc/", "/var/", "/tmp/"];

/**
 * Author-time warnings for a rule set — advisory, never fatal.
 *
 * Warnings rather than rejections because the control plane does not know the
 * target host's OS: `/etc` is a real directory on Linux and the rule is correct
 * there. Refusing to sign it would block a legitimate policy; saying nothing
 * would ship one that silently does not apply. So the admin is told and decides.
 *
 * The reliable way to get a resource pattern right is to copy it from
 * `vaultysclaw-sensor report`, which prints the resolved form the matcher
 * actually sees.
 */
export function proxyResourceRuleWarnings(set: ProxyRuleSet): string[] {
  const warnings: string[] = [];
  for (const rule of set.resourceRules ?? []) {
    for (const resource of rule.resources) {
      const path = resource.startsWith("file://") ? resource.slice("file://".length) : null;
      if (!path) continue;
      const root = SYMLINKED_ROOTS.find((r) => path.startsWith(r));
      if (root) {
        warnings.push(
          `rule "${rule.id}" matches ${JSON.stringify(resource)}, but on macOS ${root.slice(0, -1)} is a symlink into /private — ` +
            `the interception point resolves every path before matching, so this pattern would match nothing there. ` +
            `Use "file:///private${path}" for macOS hosts, or keep this rule for Linux hosts only.`
        );
      }
    }
  }
  return warnings;
}

export function subjectScopedRuleIds(set: ProxyRuleSet): string[] {
  const scoped = (r: { subject: ProxyRuleSubject }) => r.subject === "agent" || r.subject === "workload";
  return [
    ...set.rules.filter(scoped).map((r) => r.id),
    // Resource rules are refused by the same load-time check, so omitting them
    // here would let an admin sign a set the verifier rejects while the UI
    // reported it clean.
    ...(set.resourceRules ?? []).filter(scoped).map((r) => r.id),
  ];
}
