/**
 * Mock LiteLLM proxy server for integration testing.
 *
 * Implements the subset of LiteLLM API used by VaultysClaw:
 *   POST /model/new        — register model (idempotent)
 *   POST /model/delete     — remove model
 *   GET  /model/info       — list registered models
 *   POST /key/generate     — create a virtual key
 *   GET  /health/liveliness — liveness probe
 *
 *   GET  /test/models      — list registered models (for test assertions)
 *   GET  /test/keys        — list virtual keys (for test assertions)
 *   DELETE /test/reset     — clear all state
 */

const http = require("http");

const PORT = process.env.PORT || 4000;

const models = new Map(); // modelName -> params
const keys = new Map(); // teamId -> virtualKey

let keyCounter = 1000;

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const { method, url } = req;

  // ── Liveness ──
  if (method === "GET" && url === "/health/liveliness") {
    return json(res, 200, { status: "healthy" });
  }

  // ── Register model ──
  if (method === "POST" && url === "/model/new") {
    const body = await readBody(req);
    if (!body.model_name || !body.litellm_params) {
      return json(res, 400, {
        error: "model_name and litellm_params required",
      });
    }
    models.set(body.model_name, body.litellm_params);
    return json(res, 200, { model_name: body.model_name });
  }

  // ── Remove model ──
  if (method === "POST" && url === "/model/delete") {
    const body = await readBody(req);
    if (!models.has(body.model_name)) {
      return json(res, 404, { error: "model not found" });
    }
    models.delete(body.model_name);
    return json(res, 200, { ok: true });
  }

  // ── List models ──
  if (method === "GET" && url === "/model/info") {
    return json(res, 200, {
      data: Array.from(models.entries()).map(([name, params]) => ({
        model_name: name,
        litellm_params: params,
      })),
    });
  }

  // ── Generate virtual key ──
  if (method === "POST" && url === "/key/generate") {
    const body = await readBody(req);
    const virtualKey = `sk-litellm-test-${keyCounter++}`;
    keys.set(body.team_id ?? virtualKey, {
      key: virtualKey,
      models: body.models ?? [],
      max_budget: body.max_budget ?? null,
    });
    return json(res, 200, { key: virtualKey, team_id: body.team_id });
  }

  // ── Test helpers ──
  if (method === "GET" && url === "/test/models") {
    return json(res, 200, { models: Object.fromEntries(models) });
  }

  if (method === "GET" && url === "/test/keys") {
    return json(res, 200, { keys: Object.fromEntries(keys) });
  }

  if (method === "DELETE" && url === "/test/reset") {
    models.clear();
    keys.clear();
    keyCounter = 1000;
    return json(res, 200, { ok: true });
  }

  json(res, 404, { error: `${method} ${url} not found` });
});

server.listen(PORT, () => {
  console.log(`[mock-litellm] listening on :${PORT}`);
});
