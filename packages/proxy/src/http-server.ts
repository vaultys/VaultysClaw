/**
 * The reverse-proxy listener. Per request: resolve which configured upstream
 * it's addressed to (by Host header), match a rule against the full
 * destination URL, resolve+authorize the principal for `governed` rules, and
 * forward or reject — all from the locally cached config, no control-plane
 * round trip.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type {
  ProxyActivityLogEntryPayload,
  ProxyRulePayload,
  ProxyUpstreamPayload,
} from "@vaultysclaw/shared";
import { matchRule, extractPrincipalId } from "./rules";
import { verifySelfSignedHeader, provisionIdentity } from "./identity";
import type { LocalDb } from "./local-db";
import type { ProxyRuntime } from "./proxy-runtime";

const LOG_FLUSH_INTERVAL_MS = 2000;
const LOG_FLUSH_BATCH_SIZE = 50;

function resolveUpstream(
  host: string | undefined,
  upstreams: ProxyUpstreamPayload[]
): ProxyUpstreamPayload | null {
  if (upstreams.length === 1) return upstreams[0];
  if (!host) return null;
  return (
    upstreams.find((u) => {
      try {
        return new URL(u.baseUrl).host === host;
      } catch {
        return false;
      }
    }) ?? null
  );
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

function forbidden(res: ServerResponse, reason: string, extra?: Record<string, unknown>) {
  res.writeHead(403, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: reason, ...extra }));
}

export interface EvaluatedRequest {
  fullUrl: string;
  upstream: ProxyUpstreamPayload;
  verdict: "allow" | "deny";
  rule: ProxyRulePayload | null;
  mode: ProxyActivityLogEntryPayload["mode"];
  reason?: string;
  principalDid?: string;
  externalId?: string;
  identitySource?: "self_signed" | "proxy_provisioned";
}

/**
 * The governance decision, factored out of the HTTP listener so the MCP
 * server (`mcp-server.ts`) can run requests through the exact same
 * allow/deny logic instead of re-implementing it against a raw socket.
 */
export async function evaluateRequest(
  method: string,
  path: string,
  headers: Record<string, string | string[] | undefined>,
  body: Buffer,
  localDb: LocalDb
): Promise<EvaluatedRequest | { error: string; status: number }> {
  const config = localDb.loadConfig();
  if (!config) {
    return { error: "Proxy has no synced configuration yet — try again shortly", status: 403 };
  }

  const hostHeader = headers.host;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  const upstream = resolveUpstream(host, config.upstreams);
  if (!upstream) {
    return { error: "No matching upstream configured for this host", status: 502 };
  }

  const fullUrl = new URL(path, upstream.baseUrl).toString();
  const rule = matchRule(method, fullUrl, config.rules);

  if (!rule) {
    if (config.defaultMode === "passthrough") {
      return { fullUrl, upstream, verdict: "allow", rule: null, mode: "default_passthrough" };
    }
    return {
      fullUrl,
      upstream,
      verdict: "deny",
      rule: null,
      mode: "default_deny",
      reason: "No rule matched this request",
    };
  }

  if (rule.mode === "no_check") {
    return { fullUrl, upstream, verdict: "allow", rule, mode: "no_check" };
  }

  // rule.mode === "governed"
  const resolution = await resolveIdentity(method, headers, fullUrl, body, rule, localDb);

  if (!resolution) {
    return { fullUrl, upstream, verdict: "deny", rule, mode: "governed", reason: "Invalid or missing signature" };
  }

  const { did, externalId, identitySource } = resolution;
  const principal = config.principals.find((p) => p.did === did);

  if (!principal) {
    return {
      fullUrl,
      upstream,
      verdict: "deny",
      rule,
      mode: "governed",
      reason: "Unrecognized principal",
      principalDid: did,
      externalId,
      identitySource,
    };
  }

  const governanceRule = rule.governanceRule;
  const granted =
    principal.status === "active" &&
    (!governanceRule || principal.governanceRules.includes(governanceRule));

  if (!granted) {
    return {
      fullUrl,
      upstream,
      verdict: "deny",
      rule,
      mode: "governed",
      reason: `Governance rule '${governanceRule ?? "(none)"}' not granted`,
      principalDid: did,
      externalId,
      identitySource,
    };
  }

  return {
    fullUrl,
    upstream,
    verdict: "allow",
    rule,
    mode: "governed",
    principalDid: did,
    externalId,
    identitySource,
  };
}

interface StartOptions {
  port: number;
  localDb: LocalDb;
  runtime: ProxyRuntime;
}

export function startHttpServer({ port, localDb, runtime }: StartOptions): {
  stop: () => void;
} {
  let pendingLogs: ProxyActivityLogEntryPayload[] = [];
  const flush = () => {
    if (pendingLogs.length === 0) return;
    const batch = pendingLogs;
    pendingLogs = [];
    runtime.reportActivityLog(batch);
  };
  const flushTimer = setInterval(flush, LOG_FLUSH_INTERVAL_MS);
  const queueLog = (entry: ProxyActivityLogEntryPayload) => {
    pendingLogs.push(entry);
    if (pendingLogs.length >= LOG_FLUSH_BATCH_SIZE) flush();
  };

  const server = createServer((req, res) => {
    handleRequest(req, res, localDb, queueLog).catch((err) => {
      runtime.reportError("Unhandled error in proxy request", err);
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "internal proxy error" }));
      }
    });
  });

  server.listen(port);

  return {
    stop: () => {
      clearInterval(flushTimer);
      flush();
      server.close();
    },
  };
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  localDb: LocalDb,
  queueLog: (entry: ProxyActivityLogEntryPayload) => void
): Promise<void> {
  const start = Date.now();
  const method = req.method ?? "GET";
  const path = req.url ?? "/";
  const bodyBuffer = await readBody(req);

  const evaluated = await evaluateRequest(
    method,
    path,
    req.headers as Record<string, string | string[] | undefined>,
    bodyBuffer,
    localDb
  );

  if ("error" in evaluated) {
    res.writeHead(evaluated.status, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: evaluated.error }));
    return;
  }

  const { fullUrl, verdict, rule, mode, reason, principalDid, externalId, identitySource } = evaluated;

  queueLog({
    method,
    url: fullUrl,
    ruleId: rule?.id,
    mode,
    verdict,
    reason,
    principalDid,
    externalId,
    identitySource,
    timestamp: new Date().toISOString(),
    latencyMs: Date.now() - start,
  });

  if (verdict === "deny") {
    if (mode === "governed" && reason === "Unrecognized principal") {
      forbidden(
        res,
        "No security configured — please finish configuration for this identity in the VaultysClaw control plane",
        { did: principalDid }
      );
      return;
    }
    forbidden(res, reason ?? "Denied");
    return;
  }

  await forward(req, res, fullUrl, bodyBuffer);
}

interface IdentityResolution {
  did: string;
  externalId?: string;
  identitySource: "self_signed" | "proxy_provisioned";
}

async function resolveIdentity(
  method: string,
  headers: Record<string, string | string[] | undefined>,
  fullUrl: string,
  body: Buffer,
  rule: ProxyRulePayload,
  localDb: LocalDb
): Promise<IdentityResolution | null> {
  const header = headers["x-vaultysid"];
  const headerValue = Array.isArray(header) ? header[0] : header;

  if (headerValue) {
    const did = verifySelfSignedHeader(headerValue, method, fullUrl, body);
    if (!did) return null;
    return { did, identitySource: "self_signed" };
  }

  // No header — resolve (or mint) a proxy-provisioned identity.
  const externalId = extractPrincipalId(rule.principalIdSource, {
    headers,
    url: fullUrl,
    jsonBody: parseJsonBody(body),
  });
  if (!externalId) return null;

  let vid = localDb.getProvisionedIdentity(externalId);
  if (!vid) {
    vid = await provisionIdentity();
    localDb.saveProvisionedIdentity(externalId, vid);
  }

  return { did: vid.did, externalId, identitySource: "proxy_provisioned" };
}

function parseJsonBody(body: Buffer): Record<string, unknown> | undefined {
  if (body.length === 0) return undefined;
  try {
    const parsed = JSON.parse(body.toString("utf8"));
    return typeof parsed === "object" && parsed !== null ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export interface ForwardedResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

/** Forward a request upstream and collect the response — shared by the raw HTTP listener and the MCP tool. */
export async function forwardRequest(
  method: string,
  fullUrl: string,
  requestHeaders: Record<string, string | string[] | undefined>,
  body: Buffer
): Promise<ForwardedResponse> {
  const headers = new Headers();
  for (const [key, value] of Object.entries(requestHeaders)) {
    if (!value || key === "host" || key === "content-length") continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }

  const upstreamRes = await fetch(fullUrl, {
    method,
    headers,
    body: body.length > 0 ? body : undefined,
  });

  const responseHeaders: Record<string, string> = {};
  upstreamRes.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  return {
    status: upstreamRes.status,
    headers: responseHeaders,
    body: Buffer.from(await upstreamRes.arrayBuffer()),
  };
}

async function forward(
  req: IncomingMessage,
  res: ServerResponse,
  fullUrl: string,
  body: Buffer
): Promise<void> {
  const forwarded = await forwardRequest(req.method ?? "GET", fullUrl, req.headers, body);
  res.writeHead(forwarded.status, forwarded.headers);
  res.end(forwarded.body);
}
