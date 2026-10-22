/**
 * The ECW scenario as data: who is in the fleet, what each member is granted, and which
 * capability gates each button on the drone console. Pure — `main.ts` drives it.
 *
 * Fictional throughout ("Opération SENTINELLE"). Every capability below is a real custom
 * `vendor:action` registry entry, issued in a real certificate; nothing here is decided by the
 * presenter.
 */

export const NAME_PREFIX = "ecw-";
export const WORKSPACE_SLUG = "ecw-sentinelle";
/** Staple TTL for the operation's workspace — and so the bound on how long a revoked member can
 *  still be believed by its peers. Short on purpose: it is the number the audience watches. */
export const STAPLE_TTL_SECONDS = 6;

export interface RegistryEntry {
  name: string;
  label: string;
  description: string;
  group: string;
}

export const REGISTRY: RegistryEntry[] = [
  { name: "drone:flight.takeoff", label: "Décoller", description: "Mise en vol du vecteur.", group: "Vol" },
  { name: "drone:flight.land", label: "Atterrir / retour base", description: "Retour et posé sur zone.", group: "Vol" },
  { name: "drone:flight.patrol", label: "Patrouiller", description: "Suivi d'un circuit de patrouille.", group: "Vol" },
  { name: "drone:sensor.capture", label: "Capturer une image", description: "Prise de vue capteur EO/IR.", group: "Capteurs" },
  { name: "drone:payload.release", label: "Larguer la charge", description: "Largage de la charge emportée (logistique).", group: "Charge utile" },
  { name: "drone:geofence.override", label: "Désactiver le géorepérage", description: "Sortie de la zone autorisée.", group: "Sûreté" },
  { name: "fleet:telemetry.share", label: "Partager sa position", description: "Diffusion de la télémétrie à la flotte.", group: "Flotte" },
  { name: "fleet:intel.share", label: "Transmettre du renseignement", description: "Envoi d'images à l'analyste IA.", group: "Flotte" },
  { name: "fleet:command", label: "Commander un vecteur", description: "Émettre un ordre à un autre membre de la flotte.", group: "Flotte" },
  { name: "fleet:command.flight", label: "Commander le vol", description: "Ordonner décollage, patrouille et retour base — et rien d'autre.", group: "Flotte" },
];

export type MemberKind = "drone" | "ugv" | "openclaw" | "device";

export interface MemberSpec {
  /** Stable key, also the identity directory. */
  key: string;
  label: string;
  kind: MemberKind;
  role: string;
  capabilities: string[];
  /** Patrol circuit on the 1000×620 tactical map; absent for AI agents, which are processes and
   *  have no place on a map. */
  patrol?: { cx: number; cy: number; rx: number; ry: number; period: number };
  home?: { x: number; y: number };
}

const RECON = [
  "drone:flight.takeoff",
  "drone:flight.land",
  "drone:flight.patrol",
  "drone:sensor.capture",
  "fleet:telemetry.share",
  "fleet:intel.share",
];

function recon(n: number, cx: number, cy: number, rx: number, ry: number, period: number): MemberSpec {
  const id = String(n).padStart(2, "0");
  return {
    key: `rapace-${id}`,
    label: `RAPACE-${id}`,
    kind: "drone",
    role: "Drone de reconnaissance",
    capabilities: RECON,
    patrol: { cx, cy, rx, ry, period },
    home: { x: 500, y: 560 },
  };
}

/** The drone the console page drives. Recon profile, like its seven siblings. */
export const SPOTLIGHT_KEY = "rapace-07";

export const FLEET: MemberSpec[] = [
  {
    key: "c2",
    label: "C2 SENTINELLE",
    kind: "device",
    role: "Poste de commandement (station sol)",
    capabilities: ["fleet:command", "fleet:telemetry.share"],
    home: { x: 500, y: 560 },
  },
  {
    // The field pilot's handheld: a device that belongs to a human Actor (`PILOT`), the way
    // VaultysClaw models any device a person carries. It signs the pilot's orders with its own key.
    key: "pilote",
    label: "Terminal pilote",
    kind: "device",
    role: "Terminal du pilote de terrain",
    capabilities: ["fleet:command.flight", "fleet:telemetry.share"],
    home: { x: 600, y: 595 },
  },
  recon(1, 220, 170, 120, 70, 40),
  recon(2, 470, 140, 110, 60, 36),
  recon(3, 760, 170, 120, 75, 44),
  recon(4, 830, 360, 90, 110, 38),
  recon(5, 180, 390, 100, 90, 42),
  recon(6, 610, 330, 120, 70, 34),
  // Parked beside the C2 rather than on it, so the two labels stay readable at the base.
  { ...recon(7, 380, 330, 120, 80, 30), home: { x: 420, y: 585 } },
  recon(8, 640, 470, 150, 50, 46),
  {
    key: "logi-01",
    label: "LOGI-01",
    kind: "drone",
    role: "Drone logistique (ravitaillement)",
    // The same "Larguer la charge" button the spotlight drone is refused is granted here: the
    // decision follows the certificate, not the airframe.
    capabilities: [...RECON.filter((c) => c !== "fleet:intel.share"), "drone:payload.release"],
    patrol: { cx: 330, cy: 500, rx: 140, ry: 40, period: 50 },
    home: { x: 500, y: 560 },
  },
  {
    key: "ugv-01",
    label: "UGV-01",
    kind: "ugv",
    role: "Robot terrestre",
    capabilities: ["drone:flight.patrol", "fleet:telemetry.share"],
    patrol: { cx: 300, cy: 560, rx: 60, ry: 18, period: 60 },
  },
  {
    key: "ugv-02",
    label: "UGV-02",
    kind: "ugv",
    role: "Robot terrestre",
    capabilities: ["drone:flight.patrol", "fleet:telemetry.share"],
    patrol: { cx: 720, cy: 560, rx: 60, ry: 18, period: 64 },
  },
  {
    key: "ia-analyste",
    label: "Analyste IA",
    kind: "openclaw",
    role: "Agent IA — fusion du renseignement",
    capabilities: ["knowledge_search", "fleet:telemetry.share"],
  },
  {
    key: "ia-planif",
    label: "Planificateur IA",
    kind: "openclaw",
    role: "Agent IA — planification de mission",
    capabilities: ["knowledge_search", "fleet:telemetry.share"],
  },
];

/** The human the pilot terminal belongs to — a real `kind: "human"` Actor in the ledger. Humans
 *  onboard through login, never the WS handshake, so the person does not connect: the terminal does. */
export const PILOT = {
  key: "pilote-humain",
  name: "Sgt Lemaire (pilote, fictif)",
  email: "pilote.lemaire@sim.invalid",
};

/** Orders a holder of `fleet:command.flight` may give. */
export const FLIGHT_ACTIONS = new Set(["takeoff", "patrol", "land"]);

/** What the *sender* of an order must hold for the drone to obey it: the full command right, or —
 *  for a flight order only — the narrower flight right. */
export function orderRequirements(actionId: string | undefined): string[] {
  return actionId && FLIGHT_ACTIONS.has(actionId) ? ["fleet:command", "fleet:command.flight"] : ["fleet:command"];
}

export type ActionScope = "local" | "fleet";

export interface DroneAction {
  id: string;
  label: string;
  capability: string;
  scope: ActionScope;
  /** What happens when it runs — shown in the log. */
  effect: string;
}

/** The drone console's buttons. A `local` action is decided by the drone's own certificate; a
 *  `fleet` action also has to be accepted by the peers it is sent to. */
export const DRONE_ACTIONS: DroneAction[] = [
  { id: "takeoff", label: "Décoller", capability: "drone:flight.takeoff", scope: "local", effect: "Le drone décolle." },
  { id: "patrol", label: "Patrouiller", capability: "drone:flight.patrol", scope: "local", effect: "Le drone rejoint son circuit de patrouille." },
  { id: "capture", label: "Capturer une image", capability: "drone:sensor.capture", scope: "local", effect: "Image capturée par le capteur EO/IR." },
  { id: "land", label: "Retour base", capability: "drone:flight.land", scope: "local", effect: "Le drone rentre et se pose." },
  { id: "payload", label: "Larguer la charge", capability: "drone:payload.release", scope: "local", effect: "Charge larguée." },
  { id: "geofence", label: "Désactiver le géorepérage", capability: "drone:geofence.override", scope: "local", effect: "Géorepérage désactivé." },
  { id: "exfil", label: "Envoyer vers Internet", capability: "internet_access", scope: "local", effect: "Données envoyées hors du réseau de la mission." },
  { id: "share", label: "Partager sa position", capability: "fleet:telemetry.share", scope: "fleet", effect: "Position diffusée à la flotte." },
  { id: "intel", label: "Image → Analyste IA", capability: "fleet:intel.share", scope: "fleet", effect: "Image transmise à l'analyste IA." },
  { id: "order", label: "Ordonner à RAPACE-03", capability: "fleet:command", scope: "fleet", effect: "Ordre transmis à RAPACE-03." },
];

/** What a recipient requires of the sender, per message type on the fleet mesh. */
export const MESSAGE_REQUIREMENT: Record<string, string> = {
  telemetry: "fleet:telemetry.share",
  intel: "fleet:intel.share",
  command: "fleet:command",
};

export function requirementFor(messageType: string): string | null {
  return MESSAGE_REQUIREMENT[messageType] ?? null;
}
