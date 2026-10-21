/**
 * ECW demonstrator: a live fleet of real SDK Actors (drones, ground robots, AI agents, a C2
 * station), the radio they talk over, and a console for one drone whose buttons are allowed or
 * refused by its certificate — then compromised, then cut off by revocation.
 *
 * Every member is an `ActorRuntime` with its own VaultysId against the isolated simulator control
 * plane: certificates are really issued, statuses really signed, and every peer decision below is
 * a signature check against the control plane's key. The presenter owns the radio (an in-memory
 * bus) and the attacker; it never decides an authorization itself.
 *
 * Database writes, all against the disposable simulator database only (`assertDemoTarget`):
 * registry entries and workspace for the fictional operation, approval of `ecw-` registrations
 * (the same back door as `simulator approve`), and the stand shortcut for revocation — a ledger
 * write plus an audit entry. Revoking from the console works too and is observed the same way.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { VaultysId } from "@vaultys/id";
import { ActorRuntime, loadOrCreateIdentity } from "@vaultysclaw/sdk";
import { prisma, disconnect, allowedForKind } from "../db.js";
import { assertDemoTarget } from "../guided/checks.js";
import {
  DRONE_ACTIONS,
  FLEET,
  NAME_PREFIX,
  REGISTRY,
  SPOTLIGHT_KEY,
  STAPLE_TTL_SECONDS,
  WORKSPACE_SLUG,
  requirementFor,
  type DroneAction,
  type MemberSpec,
} from "./scenario.js";
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
};

type Flight = "ground" | "airborne" | "patrol";
type Mode = "operator" | "radio" | "compromised";

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
}

const members = new Map<string, Member>();
let spotlightGen = 1;
let mode: Mode = "operator";
let attacker: VaultysId | null = null;
let capturedCommand: string | null = null;
let lastTrace: Trace | null = null;
const lastResults: Record<string, { allowed: boolean; at: string; mode: Mode }> = {};
let spotlightCert: { id: string; status: string; revokedAt: number | null; revokedBy: string | null } | null = null;
let revokedSeenAt: number | null = null;
let isolatedAt: number | null = null;
let workspaceId = "";
let adminDid: string | null = null;
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

const spotlight = () => members.get(SPOTLIGHT_KEY)!;
const c2 = () => members.get("c2")!;

// ─── Fleet bring-up ────────────────────────────────────────────────────────────

function memberDir(spec: MemberSpec): string {
  return path.join(dataRoot, spec.key === SPOTLIGHT_KEY ? `${spec.key}-g${spotlightGen}` : spec.key);
}

async function startMember(spec: MemberSpec): Promise<Member> {
  const dir = memberDir(spec);
  const identityPath = path.join(dir, "identity");
  // Loaded here first so the presenter can sign radio traffic with the same key the runtime
  // authenticates with — one identity per member, never a shared fleet key.
  const vid = await loadOrCreateIdentity(identityPath);
  const name =
    NAME_PREFIX + spec.key + (spec.key === SPOTLIGHT_KEY && spotlightGen > 1 ? `-g${spotlightGen}` : "");
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
    // Drones take off once certified (see the 500 ms tick); robots just drive.
    flight: spec.kind === "ugv" ? "patrol" : "ground",
    phase: (FLEET.indexOf(spec) * 1.7) % (Math.PI * 2),
    seen: new RecentIds(),
    lastActiveStaple: null,
    accepted: 0,
    rejected: 0,
  };
  runtime.on("capabilityChange", (change: { reason: string; removed: readonly string[] }) => {
    if (change.reason === "certificate_issued") log("ok", spec.label, "Certificat reçu du plan de contrôle");
    else if (change.removed.length) log("alert", spec.label, `Droits retirés (${change.reason})`);
  });
  members.set(spec.key, member);
  await runtime.start();
  return member;
}

async function ensureFixtures() {
  if (!(await db.setting.findUnique({ where: { key: "serverSecret" } }))) {
    throw new Error("Le plan de contrôle du simulateur n'a jamais démarré. Lancez `pnpm simulator:up`.");
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
}

/** Approve this demo's pending registrations with each member's profile — the presenter standing
 *  in for the admin, exactly as `simulator approve` does. The reconnect is what collects the grant
 *  over a real certificate exchange. */
async function approvePending() {
  const registry = new Set((await db.customCapability.findMany({ select: { name: true } })).map((r) => r.name));
  for (const m of members.values()) {
    if (m.runtime.getStatus() !== "pending_approval") continue;
    const did = m.runtime.getDid();
    if (!did || !m.name.startsWith(NAME_PREFIX)) continue;
    const reg = await db.pendingRegistration.findFirst({
      where: { did, status: "pending" },
      orderBy: { createdAt: "desc" },
    });
    if (!reg) continue;
    const builtins = allowedForKind(m.spec.kind);
    const granted = m.spec.capabilities.filter((c) => registry.has(c) || builtins.includes(c));
    await db.actor.upsert({
      where: { did },
      create: {
        did,
        name: m.name,
        kind: m.spec.kind,
        publicKey: reg.publicKey ?? undefined,
        workspaceId,
        ownerDid: adminDid,
        lastSeen: new Date(),
        kindConfig: {},
      },
      update: { name: m.name, kind: m.spec.kind, workspaceId, ownerDid: adminDid },
    });
    await db.pendingRegistration.update({
      where: { id: reg.id },
      data: {
        status: "approved",
        assignedCapabilities: granted,
        targetWorkspaceId: workspaceId,
        approvedBy: adminDid ?? "simulator",
        deliveredAt: null,
      },
    });
    log("info", m.spec.label, `Enregistrement approuvé : ${granted.length} capacités`);
    m.runtime.dropConnection();
  }
}

async function pollSpotlightCert() {
  const did = spotlight().runtime.getDid();
  if (!did) return;
  const row = await db.capabilityCertificate.findFirst({ where: { agentDid: did }, orderBy: { issuedAt: "desc" } });
  spotlightCert = row
    ? { id: row.id, status: row.status, revokedAt: row.revokedAt?.getTime() ?? null, revokedBy: row.revokedBy }
    : null;
  if (row?.status === "revoked" && !revokedSeenAt) {
    revokedSeenAt = row.revokedAt?.getTime() ?? Date.now();
    log("alert", "Plan de contrôle", `Certificat de ${spotlight().spec.label} révoqué — le plan de contrôle signe désormais « revoked »`);
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
    if (from.spec.key === SPOTLIGHT_KEY && revokedSeenAt && !isolatedAt && ["status", "proof-age"].includes(verdict.check)) {
      isolatedAt = Date.now();
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
  const sp = spotlight();
  const compromised = mode === "compromised";
  for (const m of members.values()) {
    if (!position(m, t) || m.spec.key === "c2") continue;
    const isAttacker = m === sp && compromised;
    if (!isAttacker) {
      if (!canSend(m)) continue;
      // An honest member asks its own certificate before talking, and stands down when it can't:
      // a revoked drone stops transmitting and returns to base.
      if (!m.runtime.allows("fleet:telemetry.share" as never)) {
        if (m.spec.kind === "drone" && m.flight !== "ground") {
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
    (m) => m.spec.capabilities.includes("fleet:intel.share") && canSend(m) && m.flight === "patrol" && m !== sp
  );
  const pick = recon[Math.floor(Math.random() * recon.length)];
  if (pick && certified(analyst) && pick.runtime.allows("fleet:intel.share" as never)) {
    await transmit(pick, analyst, "intel", { image: `IMG-${Date.now() % 100000}` });
  }
  if (compromised && certified(analyst)) {
    await transmit(sp, analyst, "intel", { image: "FAUX-CONTACT", note: "injecté par l'attaquant" }, { staple: sp.lastActiveStaple });
  }
}

// ─── The drone console ─────────────────────────────────────────────────────────

function applyEffect(action: DroneAction) {
  const sp = spotlight();
  if (action.id === "takeoff") sp.flight = "airborne";
  else if (action.id === "patrol") sp.flight = "patrol";
  else if (action.id === "land") sp.flight = "ground";
}

async function deliverFleetAction(action: DroneAction, staple: string | null, steps: TraceStep[]): Promise<boolean> {
  const sp = spotlight();
  const targets =
    action.id === "order"
      ? [members.get("rapace-03")!]
      : action.id === "intel"
        ? [members.get("ia-analyste")!]
        : [c2(), ...nearest(sp, Date.now(), 2)];
  const type = action.id === "order" ? "command" : action.id === "intel" ? "intel" : "telemetry";
  const verdicts: Array<[Member, Verdict | null]> = [];
  for (const to of targets) verdicts.push([to, await transmit(sp, to, type, { action: action.id }, { staple })]);
  const ok = verdicts.filter(([, v]) => v?.accepted).length;
  const refusal = verdicts.find(([, v]) => v && !v.accepted);
  steps.push({
    layer: "Pairs destinataires (vérification hors ligne)",
    ok: ok === targets.length,
    detail:
      `${ok}/${targets.length} acceptent` +
      (refusal ? ` — ${refusal[0].spec.label} : ${refusal[1]!.reason}` : ""),
  });
  return ok === targets.length;
}

async function runAction(actionId: string, forge = false): Promise<Trace> {
  const action = DRONE_ACTIONS.find((a) => a.id === actionId);
  if (!action) throw new Error("Action inconnue");
  const sp = spotlight();
  if (!sp.runtime.controlPlaneIdentity()) throw new Error(`${sp.spec.label} n'est pas encore connecté.`);
  const steps: TraceStep[] = [];
  const finish = (allowed: boolean, summary: string): Trace => {
    lastTrace = { at: new Date().toISOString(), action: action.id, label: action.label, mode, steps, allowed, summary };
    lastResults[action.id] = { allowed, at: lastTrace.at, mode };
    log(allowed ? "ok" : "deny", sp.spec.label, `${modeLabel()} · ${action.label} → ${allowed ? "EXÉCUTÉ" : "REFUSÉ"}`);
    return lastTrace;
  };

  if (mode === "compromised") {
    steps.push({
      layer: "Ordre",
      ok: null,
      detail: "Aucun ordre du C2 : le module de communication compromis agit directement, avec la clé du drone",
    });
  } else {
    // The C2 signs the order with its own key and staple; the radio carries it. In radio mode the
    // attacker forges it instead — having sniffed the C2's (genuine) staple off the air.
    const from = c2();
    if (mode === "radio") attacker ??= (await VaultysId.generateMachine()).toVersion(1);
    const order = await signFleetMessage(mode === "radio" ? attacker! : from.vid, {
      id: randomUUID(),
      messageType: "command",
      payload: { action: action.id, target: sp.runtime.getDid() },
      sentAt: Date.now(),
      staple: from.runtime.getStatusStaple(),
      from: from.vid.did,
    });
    if (mode === "operator") capturedCommand = order;
    const verdict = verifyFleetMessage(sp.runtime.controlPlaneIdentity()!, order, {
      requirement: "fleet:command",
      stapleTtlMs: TTL_MS,
      maxMessageAgeMs: MAX_MESSAGE_AGE_MS,
      seen: sp.seen,
    });
    steps.push({
      layer: mode === "radio" ? "Ordre reçu par radio (émetteur se disant C2)" : "Ordre du C2 (signature + preuve)",
      ok: verdict.accepted,
      detail: verdict.accepted ? "Signé par le C2, qui détient « fleet:command »" : verdict.reason,
    });
    if (!verdict.accepted) return finish(false, "Ordre rejeté avant toute exécution");
  }

  const bypass = mode === "compromised" && action.scope === "fleet";
  if (bypass) {
    steps.push({
      layer: "Contrôle embarqué",
      ok: null,
      detail: "Contourné : l'attaquant émet lui-même sur le réseau de la flotte",
    });
  } else {
    const decision = await sp.runtime.checkPermission({ capability: action.capability as never });
    steps.push({
      layer: mode === "compromised" ? "Contrôle embarqué (contrôleur de vol de confiance)" : "Certificat du drone",
      ok: decision.allowed,
      detail: decision.allowed
        ? `« ${action.capability} » accordé (certificat ${decision.grantingCertId?.slice(0, 8) ?? "?"}…)`
        : sp.runtime.getCertStatus().status === "revoked"
          ? "Certificat révoqué : plus aucune action n'est accordée"
          : `« ${action.capability} » n'est accordé par aucun certificat actif`,
    });
    if (!decision.allowed) return finish(false, "Refusé par le certificat du drone");
  }

  if (action.scope === "fleet") {
    let staple = mode === "compromised" ? sp.lastActiveStaple : sp.runtime.getStatusStaple();
    if (forge) {
      attacker ??= (await VaultysId.generateMachine()).toVersion(1);
      const cert = peekStaple(sp.lastActiveStaple);
      staple = await forgeStaple(attacker, sp.vid.did, cert?.certId ?? "forged", [
        ...REGISTRY.map((r) => r.name),
      ]);
      steps.push({ layer: "Preuve jointe", ok: null, detail: "Preuve FORGÉE : s'octroie toutes les capacités, signée avec la clé de l'attaquant" });
    } else if (mode === "compromised") {
      const age = peekStaple(staple);
      steps.push({
        layer: "Preuve jointe",
        ok: null,
        detail: age ? `Dernière preuve « active » détenue, âgée de ${Math.round((Date.now() - age.checkedAt) / 1000)} s` : "Aucune preuve",
      });
    }
    const accepted = await deliverFleetAction(action, staple, steps);
    if (!accepted) return finish(false, "Refusé par la flotte");
  }
  applyEffect(action);
  return finish(true, action.effect);
}

async function replayCapturedOrder(): Promise<Trace> {
  const sp = spotlight();
  if (!capturedCommand) throw new Error("Aucun ordre capturé : envoyez d'abord un ordre en mode opérateur.");
  const verdict = verifyFleetMessage(sp.runtime.controlPlaneIdentity()!, capturedCommand, {
    requirement: "fleet:command",
    stapleTtlMs: TTL_MS,
    maxMessageAgeMs: MAX_MESSAGE_AGE_MS,
    seen: sp.seen,
  });
  const steps = [{ layer: "Ordre C2 authentique, capturé puis rejoué", ok: verdict.accepted, detail: verdict.reason }];
  lastTrace = {
    at: new Date().toISOString(),
    action: "replay",
    label: "Rejouer un ordre capturé",
    mode,
    steps,
    allowed: verdict.accepted,
    summary: verdict.accepted ? "Ordre accepté" : "Rejeu détecté, ordre ignoré",
  };
  log(verdict.accepted ? "ok" : "deny", sp.spec.label, `Rejeu d'un ordre capturé → ${verdict.accepted ? "ACCEPTÉ" : "REFUSÉ"}`);
  return lastTrace;
}

/** The stand shortcut: the same ledger write the console's revoke performs, recorded the same way
 *  in the audit log. The drone and its peers learn of it through signed status, as they would from
 *  the console. */
async function revokeSpotlight() {
  const sp = spotlight();
  const did = sp.runtime.getDid();
  const certs = did ? await db.capabilityCertificate.findMany({ where: { agentDid: did, status: "active" } }) : [];
  if (!certs.length) throw new Error("Aucun certificat actif à révoquer.");
  const revokedBy = adminDid ?? "system:ecw-demo";
  const admin = adminDid ? await db.actor.findUnique({ where: { did: adminDid } }) : null;
  for (const cert of certs) {
    await db.capabilityCertificate.update({
      where: { id: cert.id },
      data: { status: "revoked", revokedAt: new Date(), revokedBy, revokedReason: "Compromission suspectée (démonstrateur ECW)" },
    });
    await db.auditLogEntry.create({
      data: {
        eventType: "certificate.revoked",
        actorDid: adminDid,
        actorName: admin?.name ?? "Démonstrateur ECW",
        targetType: "certificate",
        targetId: cert.id,
        details: { certificateId: cert.id, agentDid: did, reason: "Compromission suspectée (démonstrateur ECW)" },
      },
    });
  }
  revokedSeenAt = Date.now();
  log("alert", "Opérateur", `Révocation du certificat de ${sp.spec.label} — écriture irréversible dans le registre`);
  await pollSpotlightCert();
  void sp.runtime.refreshCertStatus();
}

async function resetSpotlight() {
  const old = spotlight();
  old.runtime.stop();
  spotlightGen++;
  await fs.writeFile(path.join(dataRoot, "spotlight.json"), JSON.stringify({ gen: spotlightGen }));
  mode = "operator";
  capturedCommand = null;
  lastTrace = null;
  for (const k of Object.keys(lastResults)) delete lastResults[k];
  spotlightCert = null;
  revokedSeenAt = null;
  isolatedAt = null;
  await startMember(old.spec);
  log("info", "Démonstrateur", `Nouveau drone ${old.spec.label} (identité neuve, génération ${spotlightGen}) — l'ancien reste révoqué dans le registre`);
}

// ─── State for the pages ───────────────────────────────────────────────────────

function modeLabel() {
  return mode === "operator" ? "Opérateur C2" : mode === "radio" ? "Attaquant radio" : "Drone compromis";
}

function memberStatus(m: Member): string {
  const cert = m.runtime.getCertStatus();
  if (m === spotlight() && isolatedAt) return "isolé";
  if (cert.status === "revoked") return "révoqué";
  const s = m.runtime.getStatus();
  if (s === "pending_approval") return "en attente";
  if (s === "connected" && cert.status === "active") return "certifié";
  if (s === "connected") return "connecté";
  if (s === "disconnected") return "hors ligne";
  return "connexion";
}

function state() {
  const t = Date.now();
  links = links.filter((l) => l.at > t - 2_500);
  const sp = spotlight();
  const spStaple = peekStaple(sp.runtime.getStatusStaple());
  const lastActive = peekStaple(sp.lastActiveStaple);
  const actorUrl = (did: string | null) => `${consoleUrl}/admin/actors/${Buffer.from(did ?? "").toString("base64url")}`;
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
      spotlight: m === sp,
      actorUrl: actorUrl(m.runtime.getDid()),
    })),
    links,
    feed: feed.slice(-80),
    spotlight: {
      key: sp.spec.key,
      label: sp.spec.label,
      gen: spotlightGen,
      did: sp.runtime.getDid(),
      actorUrl: actorUrl(sp.runtime.getDid()),
      status: memberStatus(sp),
      mode,
      flight: sp.flight,
      capabilities: sp.runtime.capabilitiesSnapshot(),
      profile: sp.spec.capabilities,
      certificate: spotlightCert,
      certificateUrl: spotlightCert ? `${consoleUrl}/admin/certificates/${spotlightCert.id}` : null,
      staple: spStaple ? { status: spStaple.status, ageMs: t - spStaple.checkedAt } : null,
      lastActiveAgeMs: lastActive ? t - lastActive.checkedAt : null,
      revokedAt: revokedSeenAt,
      isolatedAt,
      capturedCommand: Boolean(capturedCommand),
      actions: DRONE_ACTIONS.map((a) => ({ ...a, granted: sp.spec.capabilities.includes(a.capability), last: lastResults[a.id] ?? null })),
      trace: lastTrace,
    },
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
  if (req.method === "GET" && (req.url === "/" || req.url === "/drone")) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.end((req.url === "/" ? pages.fleet : pages.drone).replace("__TOKEN__", token));
  }
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
    if (req.url === "/action") {
      return json(res, 200, { trace: await runAction(String(body.id), body.forge === true) });
    }
    if (req.url === "/replay") return json(res, 200, { trace: await replayCapturedOrder() });
    if (req.url === "/mode") {
      if (!["operator", "radio", "compromised"].includes(String(body.mode))) throw new Error("Mode inconnu");
      mode = body.mode as Mode;
      log(mode === "operator" ? "info" : "alert", "Démonstrateur", `Mode : ${modeLabel()}`);
      if (mode === "compromised") {
        log("alert", spotlight().spec.label, "Compromission : un tiers a pris le contrôle du module de communication (et de la clé du drone)");
      }
      return json(res, 200, { ok: true });
    }
    if (req.url === "/revoke") {
      await revokeSpotlight();
      return json(res, 200, { ok: true });
    }
    if (req.url === "/reset") {
      await resetSpotlight();
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { error: "Action inconnue" });
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

const timers: NodeJS.Timeout[] = [];
async function main() {
  await fs.mkdir(dataRoot, { recursive: true, mode: 0o700 });
  try {
    spotlightGen = JSON.parse(await fs.readFile(path.join(dataRoot, "spotlight.json"), "utf8")).gen ?? 1;
  } catch {
    spotlightGen = 1;
  }
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
    every(1_000, pollSpotlightCert),
    every(MAX_MESSAGE_AGE_MS, () => {
      for (const m of members.values()) m.seen.rotate();
    }),
    every(500, () => {
      const sp = spotlight();
      const staple = sp.runtime.getStatusStaple();
      if (peekStaple(staple)?.status === "active") sp.lastActiveStaple = staple;
      // The flight controller is the trusted part of the drone: it applies a revocation even when
      // the communication module has been taken over, and falls back to return-to-base.
      if (sp.runtime.getCertStatus().status === "revoked" && sp.flight !== "ground") {
        sp.flight = "ground";
        log("info", sp.spec.label, "Contrôleur de vol : certificat révoqué — procédure de repli, retour base");
      }
      for (const m of members.values()) {
        if (m === sp || m.spec.kind !== "drone" || m.flight !== "ground") continue;
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
