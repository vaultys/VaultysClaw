/**
 * ECW demonstrator: a live fleet of real SDK Actors (drones, ground robots, AI agents, a C2
 * station), the radio they talk over, and a console for two drones — one aerial, one on the
 * ground — whose buttons are allowed or refused by their certificates, then compromised, then cut
 * off by revocation. A mission-prep tab enrols a new drone and a new person on screen.
 *
 * Every member is an `ActorRuntime` with its own VaultysId against the isolated simulator control
 * plane: certificates are really issued, statuses really signed, and every peer decision below is
 * a signature check against the control plane's key. The presenter owns the radio (an in-memory
 * bus) and the attacker; it never decides an authorization itself.
 *
 * Database writes, all against the disposable simulator database only (`assertDemoTarget`):
 * registry entries and workspace for the fictional operation, approval of `ecw-` registrations
 * (the same back door as `simulator approve` — on arrival for the fleet, on the officer's click for
 * the newcomer), invitations for the person being enrolled (redeemed through the control plane's own
 * invite page), and the stand shortcut for revocation — a ledger write plus an audit entry. Revoking
 * from the console works too and is observed the same way.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VaultysId } from "@vaultys/id";
import { ActorRuntime, loadOrCreateIdentity } from "@vaultysclaw/sdk";
import { prisma, disconnect, allowedForKind, upsertPeople } from "../db.js";
import { assertDemoTarget } from "../guided/checks.js";
import {
  CONSOLE_DRONES,
  ENROLL_KEY,
  FLEET,
  NEW_PILOT,
  OFFICER,
  PILOT,
  orderRequirements,
  NAME_PREFIX,
  REGISTRY,
  SPOTLIGHT_KEY,
  STAPLE_TTL_SECONDS,
  WORKSPACE_SLUG,
  actionsFor,
  requirementFor,
  type DroneAction,
  type DroneType,
  type MemberSpec,
} from "./scenario.js";
import { decodeCertUnsafe } from "@vaultysclaw/policy";
import { forgeStaple, peekStaple, signFleetMessage, verifyFleetMessage, type Verdict } from "./mesh.js";

const PORT = 3012;
const wsUrl = process.env.CONTROLPLANE_WS_URL ?? "";
assertDemoTarget(process.env.DATABASE_URL, wsUrl);
const db = prisma(process.env.DATABASE_URL);
const token = randomBytes(32).toString("hex");
const consoleUrl = "http://localhost:3003";
const dataRoot = path.resolve(".simdata/ecw");
const TTL_MS = STAPLE_TTL_SECONDS * 1000;
const MAX_MESSAGE_AGE_MS = 4_000;
const pages = {
  fleet: await fs.readFile(new URL("./fleet.html", import.meta.url), "utf8"),
  drone: await fs.readFile(new URL("./drone.html", import.meta.url), "utf8"),
  fleet3d: await fs.readFile(new URL("./fleet3d.js", import.meta.url), "utf8"),
};

/** three.js, served from node_modules: the page's CSP allows no CDN, and a stand cannot count on
 *  the venue's network. Only `build/` and `examples/jsm/` are reachable. */
const threeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.resolve("three"))), "..");
const VENDOR_DIRS = ["build", "examples/jsm"].map((d) => path.join(threeRoot, d) + path.sep);

async function serveVendor(url: string, res: ServerResponse): Promise<boolean> {
  if (!url.startsWith("/vendor/three/")) return false;
  const file = path.resolve(threeRoot, decodeURIComponent(url.slice("/vendor/three/".length).split("?")[0]));
  if (!file.endsWith(".js") || !VENDOR_DIRS.some((d) => file.startsWith(d))) {
    json(res, 404, { error: "Not found" });
    return true;
  }
  try {
    const body = await fs.readFile(file);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
    res.end(body);
  } catch {
    json(res, 404, { error: "Not found" });
  }
  return true;
}

/** Where an engine is: parked at the base, out on the field (hovering, or stopped on the road),
 *  or following its patrol circuit. */
type Flight = "ground" | "airborne" | "patrol";
/** Who is giving a console drone its orders: the C2, the field pilot, or the third party (over
 *  the radio, or from inside the drone it has taken over). */
type Mode = "operator" | "pilot" | "radio" | "compromised";
const MODES: Mode[] = ["operator", "pilot", "radio", "compromised"];

/** Message ids a recipient has accepted recently. Two generations, so a rotation never opens a
 *  window in which an exact replay inside the freshness bound is accepted again. */
class RecentIds {
  private current = new Set<string>();
  private previous = new Set<string>();
  has(id: string) {
    return this.current.has(id) || this.previous.has(id);
  }
  add(id: string) {
    this.current.add(id);
    return this.current;
  }
  rotate() {
    this.previous = this.current;
    this.current = new Set();
  }
}

interface Member {
  spec: MemberSpec;
  name: string;
  runtime: ActorRuntime;
  vid: VaultysId;
  flight: Flight;
  phase: number;
  seen: RecentIds;
  /** The newest staple that said "active" — what an attacker holding this member keeps replaying. */
  lastActiveStaple: string | null;
  accepted: number;
  rejected: number;
}

interface TraceStep {
  layer: string;
  ok: boolean | null;
  detail: string;
}
interface Trace {
  at: string;
  action: string;
  label: string;
  mode: Mode;
  steps: TraceStep[];
  allowed: boolean;
  summary: string;
}
interface FeedEvent {
  id: number;
  at: string;
  level: "ok" | "deny" | "info" | "alert";
  source: string;
  text: string;
}
interface Link {
  from: string;
  to: string;
  ok: boolean;
  type: string;
  at: number;
  /** Refused by the *sender's* own certificate: the message never left. Every other refusal
   *  happens at the recipient, after the message has arrived. */
  blocked?: boolean;
}

/** One console drone's scenario: who orders it, what it last did, and where its revocation is. */
interface DroneConsole {
  key: string;
  type: DroneType;
  typeLabel: string;
  mode: Mode;
  capturedCommand: string | null;
  lastTrace: Trace | null;
  lastResults: Record<string, { allowed: boolean; at: string; mode: Mode }>;
  cert: { id: string; status: string; revokedAt: number | null; revokedBy: string | null } | null;
  revokedSeenAt: number | null;
  isolatedAt: number | null;
  /** The stand shortcut was used: approve this pending identity from here instead of the console. */
  approveHere: boolean;
}

const freshConsole = (d: (typeof CONSOLE_DRONES)[number]): DroneConsole => ({
  key: d.key,
  type: d.type,
  typeLabel: d.label,
  mode: "operator",
  capturedCommand: null,
  lastTrace: null,
  lastResults: {},
  cert: null,
  revokedSeenAt: null,
  isolatedAt: null,
  approveHere: false,
});

const members = new Map<string, Member>();
const consoles = new Map<string, DroneConsole>(CONSOLE_DRONES.map((d) => [d.key, freshConsole(d)]));
/** The console drone the drone page is driving — and the one the fleet view highlights. */
let selected = SPOTLIGHT_KEY;
/** Identity generation of each renewable member (the console drones and the newcomer), persisted
 *  so a restart keeps the current identities. */
let gens: Record<string, number> = {};
const RENEWABLE = new Set([...CONSOLE_DRONES.map((d) => d.key), ENROLL_KEY]);

let attacker: VaultysId | null = null;
/** The third party on the radio link — not a fleet member, so it has no certificate and no place
 *  in `members`. Drawn just outside the geofence on the fleet map. */
const ATTACKER_KEY = "tiers-radio";
const ATTACKER_POS = { x: 1000, y: 34 };
const attack = { attempts: 0, accepted: 0 };

/** Mission prep: the newcomer waits for the officer's click; the person, for their invitation. */
const enrolment = {
  droneApprovedAt: null as number | null,
  droneCertifiedAt: null as number | null,
  invite: null as null | { tokenHash: string; url: string; name: string; issuedAt: number },
  human: null as null | { did: string; name: string; redeemedAt: number; certificateId: string | null; capabilities: string[] },
};

let workspaceId = "";
let adminDid: string | null = null;
let pilotHumanDid: string | null = null;
let officerDid: string | null = null;
let ready = false;
let fatal = "";
let shuttingDown = false;
const startedAt = new Date().toISOString();
let feed: FeedEvent[] = [];
let feedSeq = 0;
let links: Link[] = [];
const counters = { accepted: 0, rejected: 0 };
const lastLogged = new Map<string, number>();

function log(level: FeedEvent["level"], source: string, text: string) {
  feed.push({ id: ++feedSeq, at: new Date().toISOString(), level, source, text });
  if (feed.length > 250) feed = feed.slice(-200);
}
/** At most one line per key every few seconds — the radio is chatty, the feed is for humans. */
function logThrottled(key: string, level: FeedEvent["level"], source: string, text: string) {
  const now = Date.now();
  if ((lastLogged.get(key) ?? 0) > now - 4_000) return;
  lastLogged.set(key, now);
  log(level, source, text);
}

const c2 = () => members.get("c2")!;
const pilotTerminal = () => members.get("pilote")!;
const memberOf = (c: DroneConsole) => members.get(c.key)!;
const consoleOf = (m: Member) => consoles.get(m.spec.key) ?? null;
const current = () => consoles.get(selected)!;

// ─── Fleet bring-up ────────────────────────────────────────────────────────────

const genOf = (key: string) => gens[key] ?? 1;

function memberDir(spec: MemberSpec): string {
  return path.join(dataRoot, RENEWABLE.has(spec.key) ? `${spec.key}-g${genOf(spec.key)}` : spec.key);
}

async function saveGens() {
  await fs.writeFile(path.join(dataRoot, "generations.json"), JSON.stringify(gens));
}

async function startMember(spec: MemberSpec): Promise<Member> {
  const dir = memberDir(spec);
  const identityPath = path.join(dir, "identity");
  // Loaded here first so the presenter can sign radio traffic with the same key the runtime
  // authenticates with — one identity per member, never a shared fleet key.
  const vid = await loadOrCreateIdentity(identityPath);
  const gen = genOf(spec.key);
  const name = NAME_PREFIX + spec.key + (RENEWABLE.has(spec.key) && gen > 1 ? `-g${gen}` : "");
  const runtime = new ActorRuntime({
    name,
    kind: spec.kind,
    controlPlaneWsUrl: wsUrl,
    identityPath,
    capabilityStatePath: path.join(dir, "capabilities.json"),
    requestedCapabilities: spec.capabilities as never,
    reconnectBaseDelayMs: 500,
    reconnectMaxDelayMs: 3000,
    logger: { debug() {}, info() {}, warn() {}, error() {} },
  });
  const member: Member = {
    spec,
    name,
    runtime,
    vid,
    // Drones take off once certified (see the 500 ms tick); background robots just drive. Console
    // drones wait at the base for their orders.
    flight: spec.kind === "ugv" && !consoles.has(spec.key) ? "patrol" : "ground",
    phase: (FLEET.indexOf(spec) * 1.7) % (Math.PI * 2),
    seen: new RecentIds(),
    lastActiveStaple: null,
    accepted: 0,
    rejected: 0,
  };
  runtime.on("capabilityChange", (change: { reason: string; removed: readonly string[] }) => {
    if (change.reason === "certificate_issued") log("ok", spec.label, "Certificat reçu du control plane");
    else if (change.removed.length) log("alert", spec.label, `Droits retirés (${change.reason})`);
  });
  members.set(spec.key, member);
  await runtime.start();
  return member;
}

async function ensureFixtures() {
  if (!(await db.setting.findUnique({ where: { key: "serverSecret" } }))) {
    throw new Error("Le control plane du simulateur n'a jamais démarré. Lancez `pnpm simulator:up`.");
  }
  const admin = await db.actor.findFirst({
    where: {
      kind: "human",
      certificates: { some: { status: "active", capabilities: { array_contains: ["admin_console_access"] } } },
    },
  });
  adminDid = admin?.did ?? null;
  for (const entry of REGISTRY) {
    const [vendor, action] = entry.name.split(":");
    await db.customCapability.upsert({
      where: { name: entry.name },
      create: { ...entry, vendor, action, createdBy: adminDid ?? "system:ecw-demo" },
      update: { label: entry.label, description: entry.description, group: entry.group },
    });
  }
  const workspace = await db.workspace.upsert({
    where: { slug: WORKSPACE_SLUG },
    create: {
      id: randomUUID(),
      slug: WORKSPACE_SLUG,
      name: "Opération SENTINELLE (fictive)",
      description: "Démonstrateur ECW — flotte autonome fictive",
      color: "#0ea5e9",
      certFailMode: "closed",
      certStapleTtlSeconds: STAPLE_TTL_SECONDS,
    },
    update: { certFailMode: "closed", certStapleTtlSeconds: STAPLE_TTL_SECONDS },
  });
  workspaceId = workspace.id;

  // The field pilot is a person, so a `kind: "human"` Actor written straight into the ledger like
  // the simulator's population (humans onboard through login, never the WS handshake). What talks
  // on the radio is the terminal they carry, which belongs to them.
  const pilot = await loadOrCreateIdentity(path.join(dataRoot, PILOT.key, "identity"));
  const officer = await loadOrCreateIdentity(path.join(dataRoot, OFFICER.key, "identity"));
  await upsertPeople(process.env.DATABASE_URL, [
    { index: 0, did: pilot.did, name: PILOT.name, email: PILOT.email, publicKey: Buffer.from(pilot.id).toString("base64") },
    { index: 1, did: officer.did, name: OFFICER.name, email: OFFICER.email, publicKey: Buffer.from(officer.id).toString("base64") },
  ]);
  pilotHumanDid = pilot.did;
  // Approvals, invitations and the stand's revocations are the officer's acts, unless a console
  // admin exists — then they are theirs, as they would be in the console.
  officerDid = adminDid ?? officer.did;
}

/** Approve this demo's pending registrations with each member's profile — the presenter standing
 *  in for the admin, exactly as `simulator approve` does. The reconnect is what collects the grant
 *  over a real certificate exchange. The newcomer is approved only once the officer has clicked. */
/** A console drone on a renewed identity (after "Réinitialiser"), not yet approved by the stand
 *  shortcut: its approval belongs to an administrator, in the console. */
const awaitsConsole = (m: Member) => {
  const c = consoleOf(m);
  return Boolean(c) && genOf(m.spec.key) > 1 && !c!.approveHere;
};

async function approvePending() {
  const registry = new Set((await db.customCapability.findMany({ select: { name: true } })).map((r) => r.name));
  for (const m of members.values()) {
    if (m.runtime.getStatus() !== "pending_approval") continue;
    if (m.spec.enroll && !enrolment.droneApprovedAt) continue;
    const renewed = awaitsConsole(m);
    const did = m.runtime.getDid();
    if (!did || !m.name.startsWith(NAME_PREFIX)) continue;
    const reg = await db.pendingRegistration.findFirst({
      where: { did, status: "pending" },
      orderBy: { createdAt: "desc" },
    });
    if (!reg) continue;
    if (renewed) {
      // A renewed console drone onboards the normal way: it stays pending until an administrator
      // approves it in the control plane's console. All the demonstrator writes is where it
      // should land (`targetWorkspaceId`), which grants nothing — the admin still chooses its rights.
      if (reg.targetWorkspaceId !== workspaceId) {
        await db.pendingRegistration.update({ where: { id: reg.id }, data: { targetWorkspaceId: workspaceId } });
        log("info", m.spec.label, "Nouvelle identité en attente d'approbation dans le control plane");
      }
      continue;
    }
    const builtins = allowedForKind(m.spec.kind);
    const granted = m.spec.capabilities.filter((c) => registry.has(c) || builtins.includes(c));
    const ownerDid = m.spec.key === "pilote" ? pilotHumanDid : officerDid;
    await db.actor.upsert({
      where: { did },
      create: {
        did,
        name: m.name,
        kind: m.spec.kind,
        publicKey: reg.publicKey ?? undefined,
        workspaceId,
        ownerDid,
        lastSeen: new Date(),
        kindConfig: {},
      },
      update: { name: m.name, kind: m.spec.kind, workspaceId, ownerDid },
    });
    await db.pendingRegistration.update({
      where: { id: reg.id },
      data: {
        status: "approved",
        assignedCapabilities: granted,
        targetWorkspaceId: workspaceId,
        approvedBy: officerDid ?? "simulator",
        deliveredAt: null,
      },
    });
    log("info", m.spec.label, `Enregistrement approuvé : ${granted.length} capacités`);
    m.runtime.dropConnection();
  }
}

async function pollCerts() {
  for (const c of consoles.values()) {
    const m = memberOf(c);
    const did = m.runtime.getDid();
    if (!did) continue;
    const row = await db.capabilityCertificate.findFirst({ where: { agentDid: did }, orderBy: { issuedAt: "desc" } });
    c.cert = row ? { id: row.id, status: row.status, revokedAt: row.revokedAt?.getTime() ?? null, revokedBy: row.revokedBy } : null;
    if (row?.status === "revoked" && !c.revokedSeenAt) {
      c.revokedSeenAt = row.revokedAt?.getTime() ?? Date.now();
      log("alert", "Control plane", `Certificat de ${m.spec.label} révoqué — le control plane signe désormais « revoked »`);
    }
  }
  // The person being enrolled: their invitation is redeemed by the control plane's invite page.
  if (enrolment.invite && !enrolment.human) {
    const inv = await db.invitation.findUnique({ where: { tokenHash: enrolment.invite.tokenHash } });
    if (inv?.redeemedAt && inv.redeemedDid) {
      const cert = await db.capabilityCertificate.findFirst({
        where: { agentDid: inv.redeemedDid, status: "active" },
        orderBy: { issuedAt: "desc" },
      });
      enrolment.human = {
        did: inv.redeemedDid,
        name: inv.name,
        redeemedAt: inv.redeemedAt.getTime(),
        certificateId: cert?.id ?? null,
        capabilities: (cert?.capabilities as string[] | undefined) ?? [],
      };
      log("ok", inv.name, "Invitation acceptée : VaultysID créé sur son appareil, certificat reçu");
    }
  } else if (enrolment.human && !enrolment.human.certificateId) {
    const cert = await db.capabilityCertificate.findFirst({ where: { agentDid: enrolment.human.did, status: "active" } });
    if (cert) {
      enrolment.human.certificateId = cert.id;
      enrolment.human.capabilities = cert.capabilities as string[];
    }
  }
}

// ─── Positions ─────────────────────────────────────────────────────────────────

function position(m: Member, t: number): { x: number; y: number } | null {
  const { patrol, home } = m.spec;
  if (!patrol && !home) return null;
  if (m.flight === "patrol" && patrol) {
    const a = m.phase + (2 * Math.PI * t) / (patrol.period * 1000);
    return { x: patrol.cx + patrol.rx * Math.cos(a), y: patrol.cy + patrol.ry * Math.sin(a) };
  }
  const base = home ?? { x: patrol!.cx, y: patrol!.cy };
  if (m.flight === "airborne" && patrol) {
    return { x: (base.x + patrol.cx) / 2, y: (base.y + patrol.cy) / 2 };
  }
  return base;
}

// ─── The radio ─────────────────────────────────────────────────────────────────

const certified = (m: Member) => m.runtime.getStatus() === "connected" && m.runtime.getCertStatus().status !== null;
/** An honest member only transmits once it holds a staple to attach — right after `cert_issued`
 *  there is a certificate but no signed status yet, and sending then would only be refused. */
const canSend = (m: Member) => certified(m) && m.runtime.getStatusStaple() !== null;
/** A console drone the third party currently speaks for. */
const hijacked = (m: Member) => consoleOf(m)?.mode === "compromised";

async function transmit(
  from: Member,
  to: Member,
  messageType: string,
  payload: Record<string, unknown>,
  opts: { staple?: string | null; signer?: VaultysId; from?: string } = {}
): Promise<Verdict | null> {
  const anchor = to.runtime.controlPlaneIdentity();
  const requirement = requirementFor(messageType);
  if (!anchor || !requirement) return null;
  const message = await signFleetMessage(opts.signer ?? from.vid, {
    id: randomUUID(),
    messageType,
    payload,
    sentAt: Date.now(),
    staple: opts.staple === undefined ? from.runtime.getStatusStaple() : opts.staple,
    from: opts.from,
  });
  const verdict = verifyFleetMessage(anchor, message, {
    requirement,
    stapleTtlMs: TTL_MS,
    maxMessageAgeMs: MAX_MESSAGE_AGE_MS,
    seen: to.seen,
  });
  links.push({ from: from.spec.key, to: to.spec.key, ok: verdict.accepted, type: messageType, at: Date.now() });
  if (verdict.accepted) {
    from.accepted++;
    counters.accepted++;
  } else {
    from.rejected++;
    counters.rejected++;
    logThrottled(`${from.spec.key}:${verdict.check}`, "deny", to.spec.label, `Refuse ${from.spec.label} : ${verdict.reason}`);
    const c = consoleOf(from);
    if (c && c.revokedSeenAt && !c.isolatedAt && ["status", "proof-age"].includes(verdict.check)) {
      c.isolatedAt = Date.now();
      log("alert", "Flotte", `${from.spec.label} est isolé : plus aucun pair n'accepte ses messages`);
    }
  }
  return verdict;
}

function nearest(m: Member, t: number, count: number): Member[] {
  const p = position(m, t);
  if (!p) return [];
  return [...members.values()]
    .filter((o) => o !== m && o.spec.key !== "c2" && position(o, t) && certified(o))
    .map((o) => ({ o, d: Math.hypot(position(o, t)!.x - p.x, position(o, t)!.y - p.y) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, count)
    .map((x) => x.o);
}

/** One round of fleet chatter: telemetry to C2 and the nearest peers, intel to the AI analyst. */
async function meshTick() {
  const t = Date.now();
  for (const m of members.values()) {
    if (!position(m, t) || m.spec.key === "c2") continue;
    const isAttacker = hijacked(m);
    if (!isAttacker) {
      if (!canSend(m)) continue;
      // An honest member asks its own certificate before talking, and stands down when it can't:
      // a revoked drone stops transmitting and returns to base.
      if (!m.runtime.allows("fleet:telemetry.share" as never)) {
        if ((m.spec.kind === "drone" || consoles.has(m.spec.key)) && m.flight !== "ground") {
          m.flight = "ground";
          log("info", m.spec.label, "Plus de droit valide — procédure de repli : retour base");
        }
        continue;
      }
    }
    const staple = isAttacker ? m.lastActiveStaple : undefined;
    const pos = position(m, t)!;
    for (const to of [c2(), ...nearest(m, t, 2)]) {
      if (certified(to)) await transmit(m, to, "telemetry", { x: Math.round(pos.x), y: Math.round(pos.y) }, { staple });
    }
  }
  const analyst = members.get("ia-analyste")!;
  const planner = members.get("ia-planif")!;
  if (canSend(c2()) && certified(planner)) await transmit(c2(), planner, "telemetry", { fleet: members.size });
  const recon = [...members.values()].filter(
    (m) => m.spec.capabilities.includes("fleet:intel.share") && canSend(m) && m.flight === "patrol" && !consoles.has(m.spec.key)
  );
  const pick = recon[Math.floor(Math.random() * recon.length)];
  if (pick && certified(analyst) && pick.runtime.allows("fleet:intel.share" as never)) {
    await transmit(pick, analyst, "intel", { image: `IMG-${Date.now() % 100000}` });
  }
  if (certified(analyst)) {
    for (const c of consoles.values()) {
      if (c.mode !== "compromised") continue;
      const m = memberOf(c);
      await transmit(m, analyst, "intel", { image: "FAUX-CONTACT", note: "injecté par l'attaquant" }, { staple: m.lastActiveStaple });
    }
  }
}

// ─── The third party on the radio ──────────────────────────────────────────────

/** How any member receives an order: signed by its sender, carrying a proof that the sender holds
 *  the right *this* order needs (`orderRequirements` — any order for `fleet:command`, movement
 *  orders only for `fleet:command.flight`), fresh, never seen before, and addressed to *it*. The
 *  action is read from the order itself; the signature check is what makes that safe to trust. */
function receiveOrder(to: Member, order: string): Verdict {
  const asked = (decodeCertUnsafe(order) as { payload?: { action?: string } } | null)?.payload?.action;
  return verifyFleetMessage(to.runtime.controlPlaneIdentity()!, order, {
    requirement: orderRequirements(asked),
    stapleTtlMs: TTL_MS,
    maxMessageAgeMs: MAX_MESSAGE_AGE_MS,
    seen: to.seen,
    audience: to.runtime.getDid() ?? undefined,
  });
}

/** An order the third party puts on the air. The recipient decides with exactly the checks it
 *  applies to a real order — nothing here marks it as hostile. */
function injectOrder(to: Member, order: string, what: string): Verdict | null {
  if (!to.runtime.controlPlaneIdentity()) return null;
  const verdict = receiveOrder(to, order);
  attack.attempts++;
  if (verdict.accepted) attack.accepted++;
  links.push({ from: ATTACKER_KEY, to: to.spec.key, ok: verdict.accepted, type: "command", at: Date.now() });
  logThrottled(
    `attack:${to.spec.key}:${verdict.check}`,
    verdict.accepted ? "alert" : "deny",
    to.spec.label,
    `${verdict.accepted ? "EXÉCUTE" : "Rejette"} un ${what} venu du tiers radio — ${verdict.reason}`
  );
  return verdict;
}

/**
 * While a console is in radio mode the third party keeps trying, against drones it can reach: an
 * order it forges while claiming to be the C2 (with the C2's genuine staple, sniffed off the air),
 * and a replay of the last real C2 order it recorded, retargeted at another drone.
 */
async function attackerTick() {
  if (![...consoles.values()].some((c) => c.mode === "radio")) return;
  attacker ??= (await VaultysId.generateMachine()).toVersion(1);
  const captured = [...consoles.values()].map((c) => c.capturedCommand).find(Boolean) ?? null;
  const targets = [...members.values()].filter((m) => (m.spec.kind === "drone" || m.spec.kind === "ugv") && certified(m));
  for (let i = 0; i < 2 && targets.length; i++) {
    const to = targets.splice(Math.floor(Math.random() * targets.length), 1)[0];
    if (i === 1 && captured) {
      injectOrder(to, captured, "ordre C2 capturé et rejoué");
      continue;
    }
    const order = await signFleetMessage(attacker, {
      id: randomUUID(),
      messageType: "command",
      payload: { action: "payload", target: to.runtime.getDid() },
      sentAt: Date.now(),
      staple: c2().runtime.getStatusStaple(),
      from: c2().vid.did,
    });
    injectOrder(to, order, "ordre forgé « Larguer la charge »");
  }
}

// ─── The drone console ─────────────────────────────────────────────────────────

function applyEffect(m: Member, action: DroneAction) {
  if (action.id === "takeoff" || action.id === "start") m.flight = "airborne";
  else if (action.id === "patrol" || action.id === "drive") m.flight = "patrol";
  else if (action.id === "land" || action.id === "back") m.flight = "ground";
}

/** Who a fleet action from a console drone is addressed to, and as which message type. */
function fleetRecipients(m: Member, action: DroneAction): { targets: Member[]; type: string } {
  const targets =
    action.id === "order"
      ? [members.get("rapace-03")!]
      : action.id === "intel"
        ? [members.get("ia-analyste")!]
        : [c2(), ...nearest(m, Date.now(), 2)];
  const type = action.id === "order" ? "command" : action.id === "intel" ? "intel" : "telemetry";
  return { targets, type };
}

async function deliverFleetAction(m: Member, action: DroneAction, staple: string | null, steps: TraceStep[]): Promise<boolean> {
  const { targets, type } = fleetRecipients(m, action);
  const verdicts: Array<[Member, Verdict | null]> = [];
  for (const to of targets) verdicts.push([to, await transmit(m, to, type, { action: action.id }, { staple })]);
  const ok = verdicts.filter(([, v]) => v?.accepted).length;
  const refusal = verdicts.find(([, v]) => v && !v.accepted);
  steps.push({
    layer: "Pairs destinataires (vérification hors ligne)",
    ok: ok === targets.length,
    detail: `${ok}/${targets.length} acceptent` + (refusal ? ` — ${refusal[0].spec.label} : ${refusal[1]!.reason}` : ""),
  });
  return ok === targets.length;
}

/** Put an order to a console drone on the map. Not counted as peer traffic: the KPIs count what
 *  peers accepted or refused of each other's messages. */
function orderLink(from: Member, to: Member, ok: boolean) {
  links.push({ from: from.spec.key, to: to.spec.key, ok, type: "command", at: Date.now() });
}

async function runAction(c: DroneConsole, actionId: string, forge = false): Promise<Trace> {
  const action = actionsFor(c.type).find((a) => a.id === actionId);
  if (!action) throw new Error("Action inconnue pour ce drone");
  const m = memberOf(c);
  if (!m.runtime.controlPlaneIdentity()) throw new Error(`${m.spec.label} n'est pas encore connecté.`);
  const mode = c.mode;
  const steps: TraceStep[] = [];
  const finish = (allowed: boolean, summary: string): Trace => {
    c.lastTrace = { at: new Date().toISOString(), action: action.id, label: action.label, mode, steps, allowed, summary };
    c.lastResults[action.id] = { allowed, at: c.lastTrace.at, mode };
    log(allowed ? "ok" : "deny", m.spec.label, `${modeLabel(mode)} · ${action.label} → ${allowed ? "EXÉCUTÉ" : "REFUSÉ"}`);
    return c.lastTrace;
  };

  if (mode === "compromised") {
    steps.push({
      layer: "Ordre",
      ok: null,
      detail: "Aucun ordre du C2 : le module de communication compromis agit directement, avec la clé du drone",
    });
  } else {
    // The C2 (or the pilot's terminal) signs the order with its own key and staple; the radio
    // carries it. In radio mode the attacker forges it instead — having sniffed the C2's (genuine)
    // staple off the air.
    const from = mode === "pilot" ? pilotTerminal() : c2();
    if (mode === "radio") attacker ??= (await VaultysId.generateMachine()).toVersion(1);
    const order = await signFleetMessage(mode === "radio" ? attacker! : from.vid, {
      id: randomUUID(),
      messageType: "command",
      payload: { action: action.id, target: m.runtime.getDid() },
      sentAt: Date.now(),
      staple: from.runtime.getStatusStaple(),
      from: from.vid.did,
    });
    if (mode === "operator" || mode === "pilot") c.capturedCommand = order;
    const verdict = mode === "radio" ? injectOrder(m, order, "ordre forgé")! : receiveOrder(m, order);
    steps.push({
      layer:
        mode === "radio"
          ? "Ordre reçu par radio (émetteur se disant C2)"
          : mode === "pilot"
            ? "Ordre du pilote (terminal : signature + preuve)"
            : "Ordre du C2 (signature + preuve)",
      ok: verdict.accepted,
      detail: verdict.accepted
        ? `Signé par ${from.spec.label}, qui détient ${orderRequirements(action.id)
            .filter((r) => from.runtime.capabilitiesSnapshot().includes(r))
            .map((r) => `« ${r} »`)
            .join(" et ")}`
        : mode === "pilot" && verdict.check === "capability"
          ? "Le pilote ne peut ordonner que le déplacement (« fleet:command.flight ») : cet ordre exige « fleet:command »"
          : verdict.reason,
    });
    if (!verdict.accepted) {
      if (mode === "operator" || mode === "pilot") orderLink(from, m, false);
      return finish(false, "Ordre rejeté avant toute exécution");
    }
  }

  const bypass = mode === "compromised" && action.scope === "fleet";
  if (bypass) {
    steps.push({ layer: "Contrôle embarqué", ok: null, detail: "Contourné : l'attaquant émet lui-même sur le réseau de la flotte" });
  } else {
    const decision = await m.runtime.checkPermission({ capability: action.capability as never });
    steps.push({
      layer: mode === "compromised" ? "Contrôle embarqué (contrôleur de confiance)" : "Certificat du drone",
      ok: decision.allowed,
      detail: decision.allowed
        ? `« ${action.capability} » accordé (certificat ${decision.grantingCertId?.slice(0, 8) ?? "?"}…)`
        : m.runtime.getCertStatus().status === "revoked"
          ? "Certificat révoqué : plus aucune action n'est accordée"
          : `« ${action.capability} » n'est accordé par aucun certificat actif`,
    });
    // A local action is drawn as the order to the drone; a fleet action as what the drone sends to
    // its recipients — and when its own certificate forbids it, as a message that never leaves:
    // stopped short, with a ✕, on the path it would have taken.
    if ((mode === "operator" || mode === "pilot") && action.scope === "local") orderLink(mode === "pilot" ? pilotTerminal() : c2(), m, decision.allowed);
    if (!decision.allowed && action.scope === "fleet") {
      const { targets, type } = fleetRecipients(m, action);
      for (const to of targets) links.push({ from: m.spec.key, to: to.spec.key, ok: false, type, at: Date.now(), blocked: true });
    }
    if (!decision.allowed) return finish(false, "Refusé par le certificat du drone");
  }

  if (action.scope === "fleet") {
    let staple = mode === "compromised" ? m.lastActiveStaple : m.runtime.getStatusStaple();
    if (forge) {
      attacker ??= (await VaultysId.generateMachine()).toVersion(1);
      const cert = peekStaple(m.lastActiveStaple);
      staple = await forgeStaple(attacker, m.vid.did, cert?.certId ?? "forged", [...REGISTRY.map((r) => r.name)]);
      steps.push({ layer: "Preuve jointe", ok: null, detail: "Preuve FORGÉE : s'octroie toutes les capacités, signée avec la clé de l'attaquant" });
    } else if (mode === "compromised") {
      const age = peekStaple(staple);
      steps.push({
        layer: "Preuve jointe",
        ok: null,
        detail: age ? `Dernière preuve « active » détenue, âgée de ${Math.round((Date.now() - age.checkedAt) / 1000)} s` : "Aucune preuve",
      });
    }
    const accepted = await deliverFleetAction(m, action, staple, steps);
    if (!accepted) return finish(false, "Refusé par la flotte");
  }
  applyEffect(m, action);
  return finish(true, action.effect);
}

async function replayCapturedOrder(c: DroneConsole): Promise<Trace> {
  const m = memberOf(c);
  if (!c.capturedCommand) throw new Error("Aucun ordre capturé : envoyez d'abord un ordre depuis le C2.");
  const verdict = injectOrder(m, c.capturedCommand, "ordre C2 capturé puis rejoué")!;
  const steps = [{ layer: "Ordre C2 authentique, capturé puis rejoué", ok: verdict.accepted, detail: verdict.reason }];
  c.lastTrace = {
    at: new Date().toISOString(),
    action: "replay",
    label: "Rejouer un ordre capturé",
    mode: c.mode,
    steps,
    allowed: verdict.accepted,
    summary: verdict.accepted ? "Ordre accepté" : "Rejeu détecté, ordre ignoré",
  };
  log(verdict.accepted ? "ok" : "deny", m.spec.label, `Rejeu d'un ordre capturé → ${verdict.accepted ? "ACCEPTÉ" : "REFUSÉ"}`);
  return c.lastTrace;
}

/** The stand shortcut: the same ledger write the console's revoke performs, recorded the same way
 *  in the audit log. The drone and its peers learn of it through signed status, as they would from
 *  the console. */
async function revoke(c: DroneConsole) {
  const m = memberOf(c);
  const did = m.runtime.getDid();
  const certs = did ? await db.capabilityCertificate.findMany({ where: { agentDid: did, status: "active" } }) : [];
  if (!certs.length) throw new Error("Aucun certificat actif à révoquer.");
  const revokedBy = officerDid ?? "system:ecw-demo";
  const admin = officerDid ? await db.actor.findUnique({ where: { did: officerDid } }) : null;
  for (const cert of certs) {
    await db.capabilityCertificate.update({
      where: { id: cert.id },
      data: { status: "revoked", revokedAt: new Date(), revokedBy, revokedReason: "Compromission suspectée (démonstrateur ECW)" },
    });
    await db.auditLogEntry.create({
      data: {
        eventType: "certificate.revoked",
        actorDid: officerDid,
        actorName: admin?.name ?? "Démonstrateur ECW",
        targetType: "certificate",
        targetId: cert.id,
        details: { certificateId: cert.id, agentDid: did, reason: "Compromission suspectée (démonstrateur ECW)" },
      },
    });
  }
  c.revokedSeenAt = Date.now();
  log("alert", "Opérateur", `Révocation du certificat de ${m.spec.label} — écriture irréversible dans le registre`);
  await pollCerts();
  void m.runtime.refreshCertStatus();
}

/** A renewable member gets a new identity: its old DID — revoked or not — stays in the ledger. */
async function renew(key: string) {
  const old = members.get(key)!;
  old.runtime.stop();
  gens[key] = genOf(key) + 1;
  await saveGens();
  await startMember(old.spec);
  log("info", "Démonstrateur", `Nouveau ${old.spec.label} (identité neuve, génération ${gens[key]}) — l'ancienne reste dans le registre`);
}

async function resetConsole(c: DroneConsole) {
  await renew(c.key);
  const d = CONSOLE_DRONES.find((x) => x.key === c.key)!;
  consoles.set(c.key, freshConsole(d));
}

async function resetEnrolment() {
  if (members.get(ENROLL_KEY)!.runtime.getStatus() !== "pending_approval") await renew(ENROLL_KEY);
  enrolment.droneApprovedAt = null;
  enrolment.droneCertifiedAt = null;
  enrolment.invite = null;
  enrolment.human = null;
}

/** A real control-plane invitation, like the console's `/admin/actors/invite` writes: a random
 *  token kept only as its hash, single-use, redeemed by the control plane's own invite page. */
async function inviteHuman() {
  const raw = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(raw).digest("hex");
  await db.invitation.create({
    data: {
      tokenHash,
      name: NEW_PILOT.name,
      capabilities: ["portal_access"],
      workspaceId,
      createdBy: officerDid ?? "system:ecw-demo",
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
    },
  });
  enrolment.invite = { tokenHash, url: `${consoleUrl}/invite/${raw}`, name: NEW_PILOT.name, issuedAt: Date.now() };
  enrolment.human = null;
  log("info", "Officier", `Invitation émise pour ${NEW_PILOT.name} (lien à usage unique, 24 h)`);
}

// ─── State for the pages ───────────────────────────────────────────────────────

function modeLabel(mode: Mode) {
  return mode === "operator" ? "Opérateur C2" : mode === "pilot" ? "Pilote humain" : mode === "radio" ? "Attaquant radio" : "Drone compromis";
}

function memberStatus(m: Member): string {
  const cert = m.runtime.getCertStatus();
  if (consoleOf(m)?.isolatedAt) return "isolé";
  if (cert.status === "revoked") return "révoqué";
  const s = m.runtime.getStatus();
  if (s === "pending_approval") return "en attente";
  if (s === "connected" && cert.status === "active") return "certifié";
  if (s === "connected") return "connecté";
  if (s === "disconnected") return "hors ligne";
  return "connexion";
}

const actorUrl = (did: string | null) => `${consoleUrl}/admin/actors/${Buffer.from(did ?? "").toString("base64url")}`;

function consoleState(c: DroneConsole, t: number) {
  const m = memberOf(c);
  const staple = peekStaple(m.runtime.getStatusStaple());
  const lastActive = peekStaple(m.lastActiveStaple);
  return {
    key: c.key,
    type: c.type,
    typeLabel: c.typeLabel,
    label: m.spec.label,
    role: m.spec.role,
    gen: genOf(c.key),
    did: m.runtime.getDid(),
    actorUrl: actorUrl(m.runtime.getDid()),
    status: memberStatus(m),
    mode: c.mode,
    flight: m.flight,
    capabilities: m.runtime.capabilitiesSnapshot(),
    profile: m.spec.capabilities,
    certificate: c.cert,
    certificateUrl: c.cert ? `${consoleUrl}/admin/certificates/${c.cert.id}` : null,
    staple: staple ? { status: staple.status, ageMs: t - staple.checkedAt } : null,
    lastActiveAgeMs: lastActive ? t - lastActive.checkedAt : null,
    revokedAt: c.revokedSeenAt,
    isolatedAt: c.isolatedAt,
    capturedCommand: Boolean(c.capturedCommand),
    actions: actionsFor(c.type).map((a) => ({
      ...a,
      granted: m.spec.capabilities.includes(a.capability),
      // Whether each sender may *order* it — the first of the two decisions an order goes through.
      c2Can: orderRequirements(a.id).some((r) => c2().spec.capabilities.includes(r)),
      pilotCan: orderRequirements(a.id).some((r) => pilotTerminal().spec.capabilities.includes(r)),
      last: c.lastResults[a.id] ?? null,
    })),
    trace: c.lastTrace,
    // A renewed identity waiting for an administrator in the console's approval queue.
    pending:
      m.runtime.getStatus() === "pending_approval"
        ? { inConsole: awaitsConsole(m), queueUrl: `${consoleUrl}/admin/actors?tab=pending` }
        : null,
  };
}

function attackerActivity() {
  const all = [...consoles.values()];
  if (all.some((c) => c.mode === "radio")) return { activity: "inject", target: null };
  const held = all.find((c) => c.mode === "compromised");
  if (held) return { activity: held.isolatedAt ? "cut" : "control", target: held.key };
  return { activity: "listen", target: null };
}

function state() {
  const t = Date.now();
  links = links.filter((l) => l.at > t - 2_500);
  const newcomer = members.get(ENROLL_KEY)!;
  const all = Object.fromEntries([...consoles.values()].map((c) => [c.key, consoleState(c, t)]));
  return {
    startedAt,
    ready,
    fatal,
    ttlSeconds: STAPLE_TTL_SECONDS,
    consoleUrl,
    workspaceUrl: workspaceId ? `${consoleUrl}/admin/workspaces/${workspaceId}` : null,
    now: t,
    counters: {
      ...counters,
      certified: [...members.values()].filter((m) => memberStatus(m) === "certifié").length,
      total: members.size,
    },
    members: [...members.values()].map((m) => ({
      key: m.spec.key,
      label: m.spec.label,
      kind: m.spec.kind,
      role: m.spec.role,
      status: memberStatus(m),
      capabilities: m.runtime.capabilitiesSnapshot(),
      flight: m.flight,
      position: position(m, t),
      accepted: m.accepted,
      rejected: m.rejected,
      spotlight: m.spec.key === selected,
      console: consoles.has(m.spec.key),
      enrolling: Boolean(m.spec.enroll) && memberStatus(m) !== "certifié",
      actorUrl: actorUrl(m.runtime.getDid()),
    })),
    links,
    attacker: {
      key: ATTACKER_KEY,
      position: ATTACKER_POS,
      // What the third party is doing right now, in the presenter's chosen scenario.
      ...attackerActivity(),
      attempts: attack.attempts,
      accepted: attack.accepted,
    },
    feed: feed.slice(-80),
    // The two legitimate senders of orders, for the drone page's C2 and Humain tabs.
    senders: {
      c2: { label: c2().spec.label, status: memberStatus(c2()), capabilities: c2().runtime.capabilitiesSnapshot(), actorUrl: actorUrl(c2().runtime.getDid()) },
      pilot: {
        label: pilotTerminal().spec.label,
        human: PILOT.name,
        humanUrl: pilotHumanDid ? actorUrl(pilotHumanDid) : null,
        status: memberStatus(pilotTerminal()),
        capabilities: pilotTerminal().runtime.capabilitiesSnapshot(),
        actorUrl: actorUrl(pilotTerminal().runtime.getDid()),
      },
    },
    // Mission prep: what the officer is enrolling, step by step.
    enrolment: {
      drone: {
        key: ENROLL_KEY,
        label: newcomer.spec.label,
        role: newcomer.spec.role,
        did: newcomer.runtime.getDid(),
        runtime: newcomer.runtime.getStatus(),
        status: memberStatus(newcomer),
        profile: newcomer.spec.capabilities,
        capabilities: newcomer.runtime.capabilitiesSnapshot(),
        approvedAt: enrolment.droneApprovedAt,
        certifiedAt: enrolment.droneCertifiedAt,
        actorUrl: actorUrl(newcomer.runtime.getDid()),
      },
      human: {
        name: NEW_PILOT.name,
        invite: enrolment.invite ? { url: enrolment.invite.url, issuedAt: enrolment.invite.issuedAt } : null,
        enrolled: enrolment.human
          ? { ...enrolment.human, actorUrl: actorUrl(enrolment.human.did), certificateUrl: enrolment.human.certificateId ? `${consoleUrl}/admin/certificates/${enrolment.human.certificateId}` : null }
          : null,
      },
    },
    selected,
    consoles: all,
    // The selected console drone, under the name the fleet page already reads.
    spotlight: all[selected],
  };
}

// ─── HTTP ──────────────────────────────────────────────────────────────────────

function json(res: ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 4096) throw new Error("Requête trop volumineuse");
  }
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

/** The console a request is about: the one it names, else the one the page is driving. */
function target(body: Record<string, unknown>): DroneConsole {
  const key = typeof body.key === "string" ? body.key : selected;
  const c = consoles.get(key);
  if (!c) throw new Error("Drone inconnu");
  return c;
}

let busy = false;
const hosts = [`localhost:${PORT}`, `127.0.0.1:${PORT}`];
const server = createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'"
  );
  if (!hosts.includes(req.headers.host ?? "")) return json(res, 403, { error: "Invalid host" });
  // Pages are matched on their path alone, so a query string (`/?debug`) still serves them.
  const page = (req.url ?? "").split("?")[0];
  if (req.method === "GET" && (page === "/" || page === "/drone")) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.end((page === "/" ? pages.fleet : pages.drone).replace("__TOKEN__", token));
  }
  if (req.method === "GET" && req.url === "/fleet3d.js") {
    res.setHeader("Content-Type", "text/javascript; charset=utf-8");
    return res.end(pages.fleet3d);
  }
  if (req.method === "GET" && (await serveVendor(req.url ?? "", res))) return;
  if (req.method === "GET" && req.url === "/state") {
    if (!members.size) return json(res, 503, { error: fatal || "Démarrage…" });
    return json(res, 200, state());
  }
  const supplied = Buffer.from(String(req.headers["x-demo-token"] ?? ""));
  if (
    req.method !== "POST" ||
    supplied.length !== token.length ||
    !timingSafeEqual(supplied, Buffer.from(token)) ||
    !hosts.map((h) => `http://${h}`).includes(req.headers.origin ?? "")
  )
    return json(res, 403, { error: "Ouvrez la page locale du démonstrateur pour agir." });
  if (busy) return json(res, 409, { error: "Une action est déjà en cours." });
  busy = true;
  try {
    const body = await readBody(req);
    switch (req.url) {
      case "/select": {
        selected = target(body).key;
        return json(res, 200, { ok: true });
      }
      case "/action":
        return json(res, 200, { trace: await runAction(target(body), String(body.id), body.forge === true) });
      case "/replay":
        return json(res, 200, { trace: await replayCapturedOrder(target(body)) });
      case "/mode": {
        if (!MODES.includes(body.mode as Mode)) throw new Error("Mode inconnu");
        const c = target(body);
        c.mode = body.mode as Mode;
        log(c.mode === "operator" ? "info" : "alert", "Démonstrateur", `${memberOf(c).spec.label} — mode : ${modeLabel(c.mode)}`);
        if (c.mode === "compromised") {
          log("alert", memberOf(c).spec.label, "Compromission : un tiers a pris le contrôle du module de communication (et de la clé du drone)");
        }
        return json(res, 200, { ok: true });
      }
      case "/revoke":
        await revoke(target(body));
        return json(res, 200, { ok: true });
      case "/reset":
        await resetConsole(target(body));
        return json(res, 200, { ok: true });
      case "/approve": {
        // The stand shortcut, for when no administrator is signed into the console.
        const c = target(body);
        if (memberOf(c).runtime.getStatus() !== "pending_approval") throw new Error(`${memberOf(c).spec.label} n'attend pas d'approbation.`);
        c.approveHere = true;
        log("info", "Officier", `${memberOf(c).spec.label} approuvé depuis le démonstrateur (raccourci du stand)`);
        await approvePending();
        return json(res, 200, { ok: true });
      }
      case "/enroll/approve": {
        const m = members.get(ENROLL_KEY)!;
        if (m.runtime.getStatus() !== "pending_approval") throw new Error(`${m.spec.label} n'attend pas d'approbation.`);
        enrolment.droneApprovedAt = Date.now();
        log("info", "Officier", `${m.spec.label} approuvé avec le profil « Reconnaissance »`);
        await approvePending();
        return json(res, 200, { ok: true });
      }
      case "/enroll/reset":
        await resetEnrolment();
        return json(res, 200, { ok: true });
      case "/enroll/invite":
        await inviteHuman();
        return json(res, 200, { ok: true, url: enrolment.invite!.url });
      default:
        return json(res, 404, { error: "Action inconnue" });
    }
  } catch (e) {
    const message =
      e instanceof Error && e.name.startsWith("Prisma")
        ? "Base du simulateur indisponible : lancez `pnpm simulator:up`."
        : e instanceof Error
          ? e.message
          : String(e);
    return json(res, 422, { error: message });
  } finally {
    busy = false;
  }
});

// ─── Lifecycle ─────────────────────────────────────────────────────────────────

function every(ms: number, fn: () => Promise<void> | void) {
  let running = false;
  const timer = setInterval(async () => {
    if (running || shuttingDown) return;
    running = true;
    try {
      await fn();
    } catch (e) {
      logThrottled(`err:${String(e)}`, "info", "Démonstrateur", e instanceof Error ? e.message.slice(0, 200) : String(e));
    } finally {
      running = false;
    }
  }, ms);
  return timer;
}

async function loadGens() {
  try {
    gens = JSON.parse(await fs.readFile(path.join(dataRoot, "generations.json"), "utf8"));
    return;
  } catch {
    gens = {};
  }
  // Before there were two console drones, RAPACE-07's generation lived on its own.
  try {
    gens[SPOTLIGHT_KEY] = JSON.parse(await fs.readFile(path.join(dataRoot, "spotlight.json"), "utf8")).gen ?? 1;
  } catch {
    /* first run */
  }
}

const timers: NodeJS.Timeout[] = [];
async function main() {
  await fs.mkdir(dataRoot, { recursive: true, mode: 0o700 });
  await loadGens();
  server.listen(PORT, "127.0.0.1", () =>
    console.log(`Démonstrateur ECW : flotte http://localhost:${PORT} · drone http://localhost:${PORT}/drone · console ${consoleUrl}`)
  );
  try {
    await ensureFixtures();
  } catch (e) {
    fatal =
      e instanceof Error && e.name.startsWith("Prisma")
        ? "Base du simulateur indisponible : lancez `pnpm simulator:up` dans un autre terminal, puis relancez."
        : e instanceof Error
          ? e.message
          : String(e);
    console.error(fatal);
    return;
  }
  log("info", "Démonstrateur", `Opération SENTINELLE : ${FLEET.length} acteurs, TTL des preuves ${STAPLE_TTL_SECONDS} s`);
  for (const spec of FLEET) await startMember(spec);
  ready = true;
  timers.push(
    every(1_500, approvePending),
    every(1_500, meshTick),
    every(2_500, attackerTick),
    every(1_000, pollCerts),
    every(MAX_MESSAGE_AGE_MS, () => {
      for (const m of members.values()) m.seen.rotate();
    }),
    every(500, () => {
      for (const c of consoles.values()) {
        const m = memberOf(c);
        const staple = m.runtime.getStatusStaple();
        if (peekStaple(staple)?.status === "active") m.lastActiveStaple = staple;
        // The drive controller is the trusted part of the drone: it applies a revocation even when
        // the communication module has been taken over, and falls back to return-to-base.
        if (m.runtime.getCertStatus().status === "revoked" && m.flight !== "ground") {
          m.flight = "ground";
          log("info", m.spec.label, "Contrôleur de confiance : certificat révoqué — procédure de repli, retour base");
        }
      }
      const newcomer = members.get(ENROLL_KEY)!;
      // Already enrolled by an earlier run: its certificate came back from disk, so mission prep
      // shows it done rather than waiting for a click that would approve nothing.
      if (!enrolment.droneApprovedAt && memberStatus(newcomer) === "certifié") {
        enrolment.droneApprovedAt = enrolment.droneCertifiedAt = Date.now();
      }
      if (enrolment.droneApprovedAt && !enrolment.droneCertifiedAt && memberStatus(newcomer) === "certifié") {
        enrolment.droneCertifiedAt = Date.now();
        log("ok", newcomer.spec.label, "Enrôlé : certificat reçu, il rejoint la flotte");
      }
      for (const m of members.values()) {
        if (consoles.has(m.spec.key) || m.spec.kind !== "drone" || m.flight !== "ground") continue;
        if (certified(m) && m.runtime.allows("drone:flight.patrol" as never)) m.flight = "patrol";
      }
    })
  );
}

async function shutdown() {
  shuttingDown = true;
  for (const t of timers) clearInterval(t);
  for (const m of members.values()) m.runtime.stop();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await disconnect();
}
server.on("error", async (e) => {
  console.error(e.message);
  await shutdown();
  process.exitCode = 1;
});
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
await main();
