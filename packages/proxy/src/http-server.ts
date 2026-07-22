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
  ProxyPrincipalPayload,
  ProxyRulePayload,
  ProxyUpstreamPayload,
  WSProxyConfigPayload,
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
  const config = localDb.loadConfig();
  const method = req.method ?? "GET";
  const path = req.url ?? "/";

  if (!config) {
    forbidden(res, "Proxy has no synced configuration yet — try again shortly");
    return;
  }

  const upstream = resolveUpstream(req.headers.host, config.upstreams);
  if (!upstream) {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "No matching upstream configured for this host" }));
    return;
  }

  const fullUrl = new URL(path, upstream.baseUrl).toString();
  const bodyBuffer = await readBody(req);
  const rule = matchRule(method, fullUrl, config.rules);

  const log = (verdict: "allow" | "deny", mode: ProxyActivityLogEntryPayload["mode"], extra: Partial<ProxyActivityLogEntryPayload> = {}) => {
    queueLog({
      method,
      url: fullUrl,
      ruleId: rule?.id,
      mode,
      verdict,
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - start,
      ...extra,
    });
  };

  if (!rule) {
    if (config.defaultMode === "passthrough") {
      log("allow", "default_passthrough");
      await forward(req, res, fullUrl, bodyBuffer);
    } else {
      log("deny", "default_deny", { reason: "No rule matched this request" });
      forbidden(res, "No rule matched this request — denied by default");
    }
    return;
  }

  if (rule.mode === "no_check") {
    log("allow", "no_check");
    await forward(req, res, fullUrl, bodyBuffer);
    return;
  }

  // rule.mode === "governed"
  const resolution = await resolveIdentity(req, fullUrl, bodyBuffer, rule, localDb);

  if (!resolution) {
    log("deny", "governed", { reason: "Invalid or missing signature" });
    forbidden(res, "Invalid signature");
    return;
  }

  const { did, externalId, identitySource } = resolution;
  const principal = config.principals.find((p) => p.did === did);

  if (!principal) {
    log("deny", "governed", {
      principalDid: did,
      externalId,
      identitySource,
      reason: "Unrecognized principal",
    });
    forbidden(
      res,
      "No security configured — please finish configuration for this identity in the VaultysClaw control plane",
      { did }
    );
    return;
  }

  const governanceRule = rule.governanceRule;
  const granted =
    principal.status === "active" &&
    (!governanceRule || principal.governanceRules.includes(governanceRule));

  if (!granted) {
    log("deny", "governed", {
      principalDid: did,
      externalId,
      identitySource,
      reason: `Governance rule '${governanceRule ?? "(none)"}' not granted`,
    });
    forbidden(res, `Governance rule '${governanceRule ?? "(none)"}' not granted`);
    return;
  }

  log("allow", "governed", { principalDid: did, externalId, identitySource });
  await forward(req, res, fullUrl, bodyBuffer);
}

interface IdentityResolution {
  did: string;
  externalId?: string;
  identitySource: "self_signed" | "proxy_provisioned";
}

async function resolveIdentity(
  req: IncomingMessage,
  fullUrl: string,
  body: Buffer,
  rule: ProxyRulePayload,
  localDb: LocalDb
): Promise<IdentityResolution | null> {
  const header = req.headers["x-vaultysid"];
  const headerValue = Array.isArray(header) ? header[0] : header;

  if (headerValue) {
    const did = verifySelfSignedHeader(headerValue, req.method ?? "GET", fullUrl, body);
    if (!did) return null;
    return { did, identitySource: "self_signed" };
  }

  // No header — resolve (or mint) a proxy-provisioned identity.
  const externalId = extractPrincipalId(rule.principalIdSource, {
    headers: req.headers as Record<string, string | string[] | undefined>,
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

async function forward(
  req: IncomingMessage,
  res: ServerResponse,
  fullUrl: string,
  body: Buffer
): Promise<void> {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value || key === "host" || key === "content-length") continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }

  const upstreamRes = await fetch(fullUrl, {
    method: req.method,
    headers,
    body: body.length > 0 ? body : undefined,
  });

  const responseHeaders: Record<string, string> = {};
  upstreamRes.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });
  res.writeHead(upstreamRes.status, responseHeaders);
  res.end(Buffer.from(await upstreamRes.arrayBuffer()));
}
