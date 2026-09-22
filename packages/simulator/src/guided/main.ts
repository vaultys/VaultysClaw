/** A loopback-only presenter for real SDK clients. Only fixture placement is seeded;
 * approval and kill-switch mutations go through the authenticated admin console. */
import { createServer, type ServerResponse } from "node:http";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { ActorRuntime } from "@vaultysclaw/sdk";
import { prisma, disconnect } from "../db.js";
import {
  STEPS,
  assertDemoTarget,
  expectDecisions,
  guardedOperation,
  type Observation,
} from "./checks.js";

const wsUrl = process.env.CONTROLPLANE_WS_URL ?? "";
assertDemoTarget(process.env.DATABASE_URL, wsUrl);
const db = prisma(process.env.DATABASE_URL);
const token = randomBytes(32).toString("hex");
const consoleUrl = "http://localhost:3003";
const dataRoot = path.resolve(".simdata/guided");
const template = await fs.readFile(
  new URL("./presenter.html", import.meta.url),
  "utf8"
);
const roles = ["Finance", "Research"] as const;
type Participant = {
  role: string;
  name: string;
  workspaceId: string;
  runtime: ActorRuntime;
  file: string;
};
let actors: Participant[] = [];
let runId = "";
let stage = 0;
let busy = false;
let paused = false;
let error = "";
let startedAt = "";
let events: Array<{
  at: string;
  type: string;
  detail: string;
  observations?: Observation[];
}> = [];
let originalCertIds: string[] = [];
let ownerDid = "";
let shuttingDown = false;
function event(type: string, detail: string, observations?: Observation[]) {
  events.push({
    at: new Date().toISOString(),
    type,
    detail,
    ...(observations
      ? {
          observations: observations.map((o) => ({
            ...o,
            reason: o.reason?.replaceAll(dataRoot + path.sep, "demo-files/"),
          })),
        }
      : {}),
  });
  // Bound connection noise without discarding measured evidence from earlier steps.
  const diagnostics = events.filter(
    (e) => e.type === "connection" || e.type === "capabilities"
  );
  if (diagnostics.length > 100)
    events.splice(events.indexOf(diagnostics[0]), 1);
}
function state() {
  return {
    runId,
    stage,
    steps: STEPS,
    busy,
    paused,
    error,
    startedAt,
    events,
    consoleUrl,
    actors: actors.map((a) => ({
      role: a.role,
      name: a.name,
      did: a.runtime.getDid(),
      status: a.runtime.getStatus(),
      capabilities: a.runtime.capabilitiesSnapshot(),
      workspaceUrl: `${consoleUrl}/admin/workspaces/${a.workspaceId}`,
      actorUrl: `${consoleUrl}/admin/actors/${Buffer.from(a.runtime.getDid() ?? "").toString("base64url")}`,
    })),
  };
}
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => Promise<boolean>, message: string) {
  const deadline = Date.now() + 30_000;
  do {
    if (shuttingDown) throw new Error("Demo is shutting down");
    if (await check()) return;
    await pause(500);
  } while (Date.now() < deadline);
  throw new Error(message);
}
async function archive() {
  if (runId)
    await fs.writeFile(
      path.join(dataRoot, runId, "report.json"),
      JSON.stringify(state(), null, 2)
    );
}
async function startRun() {
  // No fixture writes until the real control plane has initialized its ledger.
  if (!(await db.setting.findUnique({ where: { key: "serverSecret" } }))) {
    throw new Error(
      "Start pnpm simulator:up first, then open the console and create your administrator."
    );
  }
  const owner = await db.actor.findFirst({
    where: {
      kind: "human",
      certificates: {
        some: {
          status: "active",
          capabilities: { array_contains: ["admin_console_access"] },
        },
      },
    },
  });
  if (!owner)
    throw new Error(
      "Open http://localhost:3003/login and create or sign in as an administrator before starting the walkthrough."
    );
  ownerDid = owner.did;
  await archive();
  for (const a of actors) a.runtime.stop();
  actors = [];
  events = [];
  stage = 0;
  error = "";
  paused = false;
  originalCertIds = [];
  runId = randomUUID();
  startedAt = new Date().toISOString();
  const folder = path.join(dataRoot, runId);
  await fs.mkdir(folder, { recursive: true, mode: 0o700 });
  for (const role of roles) {
    const workspaceId = randomUUID();
    const name = `guided-${runId.slice(0, 6)}-${role.toLowerCase()}`;
    await db.workspace.create({
      data: {
        id: workspaceId,
        name: `Demo · ${role} · ${runId.slice(0, 6)}`,
        slug: name,
        description: "Fictional guided-demo fixture",
        certFailMode: "closed",
        certStapleTtlSeconds: 5,
      },
    });
    const file = path.join(folder, `${role.toLowerCase()}-sample.json`);
    await fs.writeFile(
      file,
      JSON.stringify({
        organization: "Northstar (fictional)",
        team: role,
        amount: 120,
        currency: "EUR",
      })
    );
    const runtime = new ActorRuntime({
      name,
      kind: "openclaw",
      controlPlaneWsUrl: wsUrl,
      identityPath: path.join(folder, role, "identity"),
      requestedCapabilities: ["file_read"],
      reconnectBaseDelayMs: 500,
      reconnectMaxDelayMs: 2000,
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    });
    const a = { role, name, workspaceId, runtime, file };
    actors.push(a);
    runtime.on("error", (e: Error) =>
      event("connection", `${role}: ${e.message.slice(0, 240)}`)
    );
    runtime.on("capabilityChange", (change: { reason: string }) =>
      event("capabilities", `${role}: ${change.reason}`)
    );
    await runtime.start();
  }
  await until(async () => {
    for (const a of actors) {
      const did = a.runtime.getDid();
      if (!did) return false;
      const pending = await db.pendingRegistration.findFirst({
        where: { did, status: "pending" },
      });
      if (!pending) return false;
    }
    return true;
  }, "Registrations did not arrive within 30 seconds. Check the simulator control plane and restart.");
  for (const a of actors) {
    await db.pendingRegistration.updateMany({
      where: { did: a.runtime.getDid()!, status: "pending" },
      data: { targetWorkspaceId: a.workspaceId, initiatedByUserId: owner.did },
    });
  }
  const initial = await Promise.all(actors.map(read));
  event("observed", "Read attempts before approval", initial);
  expectDecisions(initial, [false, false]);
  event("passed", STEPS[0].outcome);
  event(
    "fixtures",
    "Created two fictional workspaces and local sample files. Assigned pending requests to their workspaces; no grants were issued by the demo."
  );
  stage = 1;
}
async function read(a: Participant): Promise<Observation> {
  await a.runtime.refreshCertStatus();
  return guardedOperation(
    a.role,
    (action) => a.runtime.checkPermission(action),
    { capability: "file_read", resource: a.file },
    () => fs.readFile(a.file, "utf8")
  );
}
async function switchesArmed(): Promise<boolean[]> {
  const rows = await db.killSwitch.findMany();
  return actors.map((a) =>
    rows.some(
      (r) => r.scopeType === "global" || r.workspaceId === a.workspaceId
    )
  );
}
async function verify() {
  if (!actors.length) return startRun();
  if (stage === 0)
    throw new Error("Setup did not finish. Restart the walkthrough.");
  if (stage === 1) {
    await until(
      async () =>
        actors.every(
          (a) =>
            a.runtime.getStatus() === "connected" &&
            a.runtime.hasCapability("file_read")
        ),
      "Approve both requests with file_read in the console. A grant must actually reach each agent before this step can pass."
    );
    for (const a of actors) {
      const row = await db.actor.findUnique({
        where: { did: a.runtime.getDid()! },
      });
      if (row?.workspaceId !== a.workspaceId)
        throw new Error(
          "An agent was assigned to the wrong workspace. Correct it in the console or restart."
        );
      await db.actor.update({ where: { did: row.did }, data: { ownerDid } });
    }
    event(
      "fixtures",
      "Assigned the demo agents to the existing simulator administrator for the ownership view."
    );
    const results = await Promise.all(actors.map(read));
    event("observed", "Read checks following approval", results);
    expectDecisions(results, [true, true]);
    originalCertIds = results.map((r) => r.certificateId!);
  } else if (stage === 2) {
    const results = [
      await read(actors[0]),
      await guardedOperation(
        "Finance",
        (a) => actors[0].runtime.checkPermission(a),
        { capability: "file_write", resource: actors[0].file },
        () => fs.writeFile(actors[0].file, '{"unexpectedWrite":true}')
      ),
      await read(actors[1]),
    ];
    event("observed", "Allowed reads and attempted ungranted write", results);
    expectDecisions(results, [true, false, true]);
  } else if (stage === 3) {
    const armed = await switchesArmed();
    if (!armed[0] || armed[1])
      throw new Error(
        "Arm only the Finance workspace switch in the console. Research must remain outside the suspension."
      );
    const results = await Promise.all(actors.map(read));
    event("observed", "Workspace containment checks", results);
    expectDecisions(results, [false, true]);
  } else if (stage === 4) {
    if ((await switchesArmed()).some(Boolean))
      throw new Error(
        "Disarm the Finance switch first; neither workspace should be suspended."
      );
    await until(
      async () => actors.every((a) => a.runtime.getStatus() === "connected"),
      "The agents have not reconnected yet. Check the console and retry."
    );
    const results = await Promise.all(actors.map(read));
    event("observed", "Recovery checks", results);
    expectDecisions(results, [true, true]);
    if (results.some((r, i) => r.certificateId !== originalCertIds[i]))
      throw new Error(
        "Access returned with a different certificate. This scenario expects recovery without re-issuing grants."
      );
  } else return;
  event("passed", STEPS[stage].outcome);
  stage++;
}
function json(res: ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}
const server = createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'"
  );
  if (!["localhost:3011", "127.0.0.1:3011"].includes(req.headers.host ?? ""))
    return json(res, 403, { error: "Invalid host" });
  if (req.method === "GET" && req.url === "/") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.end(template.replace("__TOKEN__", token));
  }
  if (req.method === "GET" && req.url === "/state")
    return json(res, 200, state());
  if (req.method === "GET" && req.url === "/report") {
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="guided-demo-${runId || "not-started"}.json"`
    );
    return json(res, 200, state());
  }
  const supplied = Buffer.from(String(req.headers["x-demo-token"] ?? ""));
  if (
    req.method !== "POST" ||
    supplied.length !== token.length ||
    !timingSafeEqual(supplied, Buffer.from(token)) ||
    !["http://localhost:3011", "http://127.0.0.1:3011"].includes(
      req.headers.origin ?? ""
    )
  )
    return json(res, 403, {
      error: "Open the local demo page to operate the walkthrough.",
    });
  if (busy) return json(res, 409, { error: "A step is already running." });
  if (!["/next", "/restart", "/pause"].includes(req.url ?? ""))
    return json(res, 404, { error: "Unknown action" });
  busy = true;
  error = "";
  try {
    if (req.url === "/pause") {
      paused = !paused;
      event(
        "presenter",
        paused
          ? "Walkthrough paused; agent connections remain live."
          : "Walkthrough resumed."
      );
    } else if (req.url === "/restart") await startRun();
    else {
      if (paused) throw new Error("Resume the walkthrough first.");
      await verify();
    }
    json(res, 200, { ok: true });
  } catch (e) {
    error =
      e instanceof Error && e.name.startsWith("Prisma")
        ? "The simulator database is unavailable or needs migrations. Start pnpm simulator:up in another terminal, then retry."
        : e instanceof Error
          ? e.message
          : String(e);
    event("failed", error);
    json(res, 422, { error });
  } finally {
    busy = false;
    await archive().catch((e) =>
      console.error("Could not save demo report:", e.message)
    );
  }
});
server.listen(3011, "127.0.0.1", () =>
  console.log(
    "Guided demo: http://localhost:3011 · control plane: http://localhost:3003"
  )
);
server.on("error", async (e) => {
  console.error(e.message);
  await disconnect();
  process.exitCode = 1;
});
async function shutdown() {
  shuttingDown = true;
  for (const a of actors) a.runtime.stop();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await archive();
  await disconnect();
}
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
