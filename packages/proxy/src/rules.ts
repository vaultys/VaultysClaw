/**
 * Rule matching + principal-id extraction — the two decisions the HTTP
 * listener needs before it can verify/authorize a request.
 */
import type { ProxyRulePayload, ProxyPrincipalIdSource } from "@vaultysclaw/shared";

/** Convert a `urlPattern` (may contain `*` wildcards) into an anchored regex. */
function patternToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

/**
 * Find the first rule whose method + urlPattern matches this request's
 * method + full destination URL. Rules are matched in the order given
 * (first match wins) against the full URL, so the same relative path on two
 * different upstreams can carry different rules.
 */
export function matchRule(
  method: string,
  fullUrl: string,
  rules: ProxyRulePayload[]
): ProxyRulePayload | null {
  const upperMethod = method.toUpperCase();
  for (const rule of rules) {
    if (rule.method.toUpperCase() !== upperMethod) continue;
    if (patternToRegex(rule.urlPattern).test(fullUrl)) return rule;
  }
  return null;
}

/**
 * Extract the principal id string per the rule's configured source.
 * - `header`: the named request header, case-insensitive.
 * - `url`: the named query-string parameter.
 * - `body`: the named top-level property of a JSON request body.
 */
export function extractPrincipalId(
  source: ProxyPrincipalIdSource | undefined,
  req: {
    headers: Record<string, string | string[] | undefined>;
    url: string;
    jsonBody?: Record<string, unknown>;
  }
): string | undefined {
  if (!source) return undefined;

  if (source.from === "header") {
    const value = req.headers[source.key.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  }

  if (source.from === "url") {
    try {
      const parsed = new URL(req.url);
      return parsed.searchParams.get(source.key) ?? undefined;
    } catch {
      return undefined;
    }
  }

  // source.from === "body"
  const value = req.jsonBody?.[source.key];
  return typeof value === "string" ? value : undefined;
}
