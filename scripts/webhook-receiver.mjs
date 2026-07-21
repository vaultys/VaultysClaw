#!/usr/bin/env node
/**
 * Tiny standalone webhook receiver for local testing.
 *
 * Receives VaultysClaw webhook POSTs, verifies the HMAC signature and pretty-prints
 * each delivery to the console. Zero dependencies — just Node's http + crypto.
 *
 * Usage:
 *   node scripts/webhook-receiver.mjs
 *   PORT=4000 WEBHOOK_SECRET=whsec_xxx node scripts/webhook-receiver.mjs
 *
 * Then point a webhook (admin/settings/integrations → Webhooks) at
 * http://<this-host>:<port>/ and paste the signing secret shown at creation into
 * WEBHOOK_SECRET so signatures can be verified.
 */
import http from "node:http";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 4000);
const SECRET = process.env.WEBHOOK_SECRET || "";

// ── tiny ANSI helpers ─────────────────────────────────────────────────────────
const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

/** Recompute the signature the dispatcher sends: sha256=HMAC(secret, `${ts}.${body}`). */
function expectedSignature(secret, timestamp, rawBody) {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(`${timestamp}.${rawBody}`);
  return `sha256=${hmac.digest("hex")}`;
}

/** Constant-time compare of two signature strings. */
function safeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

const server = http.createServer((req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405).end("Method Not Allowed");
    return;
  }

  let rawBody = "";
  req.on("data", (chunk) => (rawBody += chunk));
  req.on("end", () => {
    const event = req.headers["x-vaultysclaw-event"] || "(none)";
    const delivery = req.headers["x-vaultysclaw-delivery"] || "(none)";
    const timestamp = req.headers["x-vaultysclaw-timestamp"] || "";
    const signature = req.headers["x-vaultysclaw-signature"] || "";

    // Verify signature
    let verdict;
    if (!SECRET) {
      verdict = c.yellow("⚠ not verified (WEBHOOK_SECRET unset)");
    } else if (!signature || !timestamp) {
      verdict = c.red("✗ missing signature/timestamp header");
    } else {
      const expected = expectedSignature(SECRET, String(timestamp), rawBody);
      verdict = safeEqual(expected, String(signature))
        ? c.green("✓ signature valid")
        : c.red("✗ signature INVALID");
    }

    // Pretty-print body
    let prettyBody = rawBody;
    try {
      prettyBody = JSON.stringify(JSON.parse(rawBody), null, 2);
    } catch {
      /* leave raw */
    }

    const line = "─".repeat(60);
    console.log(c.cyan(line));
    console.log(
      `${c.bold(c.cyan(String(event)))}  ${c.dim(new Date().toISOString())}`
    );
    console.log(`${c.dim("delivery:")}  ${delivery}`);
    console.log(`${c.dim("signature:")} ${verdict}`);
    console.log(c.dim("payload:"));
    console.log(prettyBody);
    console.log(c.cyan(line));

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ received: true }));
  });
});

server.listen(PORT, () => {
  console.log(c.bold(c.green(`webhook receiver listening on http://localhost:${PORT}`)));
  console.log(
    SECRET
      ? c.dim("signature verification: ON")
      : c.yellow("signature verification: OFF — set WEBHOOK_SECRET=whsec_… to enable")
  );
  console.log(c.dim("waiting for POSTs…\n"));
});

const shutdown = () => {
  console.log(c.dim("\nshutting down receiver"));
  server.close(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
