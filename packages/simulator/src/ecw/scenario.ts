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
  { name: "fleet:command.flight", label: "Commander le déplacement", description: "Ordonner décollage ou démarrage, patrouille et retour base — et rien d'autre.", group: "Flotte" },
  { name: "drone:drive.start", label: "Démarrer", description: "Quitter la base par la route.", group: "Roulage" },
  { name: "drone:drive.patrol", label: "Patrouiller (au sol)", description: "Suivi d'un circuit de patrouille au sol.", group: "Roulage" },
  { name: "drone:drive.return", label: "Retour base (au sol)", description: "Retour à la base par la route.", group: "Roulage" },
  { name: "drone:cargo.deliver", label: "Livrer le matériel", description: "Dépose du matériel transporté au point de rendez-vous.", group: "Charge utile" },
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
  /** Waits for an officer's approval in mission prep instead of being approved on arrival. */
  enroll?: boolean;
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

/** The drone the console page drives by default. Recon profile, like its seven siblings. */
export const SPOTLIGHT_KEY = "rapace-07";

export type DroneType = "air" | "ground";

/** The drones the console can drive: an aerial one and a ground one, each with its own identity
 *  that "Réinitialiser" renews. */
export const CONSOLE_DRONES: { key: string; type: DroneType; label: string }[] = [
  { key: SPOTLIGHT_KEY, type: "air", label: "Drone aérien" },
  { key: "ugv-01", type: "ground", label: "Drone terrestre" },
];

/** The newcomer the mission-prep tab enrols: a fresh drone, approved by the officer on screen. */
export const ENROLL_KEY = "rapace-09";

/** The mission officer: the human who approves enrolments and issues invitations — so the ledger
 *  says who did, even on a fresh database with no console admin yet. */
export const OFFICER = {
  key: "officier",
  name: "Cne Bernard (officier de mission, fictif)",
  email: "officier.bernard@sim.invalid",
};

/** The person the mission-prep tab enrols, through a real control-plane invitation. */
export const NEW_PILOT = { name: "Cpl Durand (pilote, fictif)" };

const GROUND = [
  "drone:drive.start",
  "drone:drive.patrol",
  "drone:drive.return",
  "drone:sensor.capture",
  "drone:cargo.deliver",
  "fleet:telemetry.share",
  "fleet:intel.share",
];

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
  // Powered on in mission prep: it registers like any drone, then waits for the officer.
  { ...recon(9, 860, 250, 70, 50, 38), enroll: true, home: { x: 560, y: 610 } },
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
    // The console's ground drone: it waits at the base for orders, like RAPACE-07.
    key: "ugv-01",
    label: "UGV-01",
    kind: "ugv",
    role: "Drone terrestre (reconnaissance et logistique)",
    capabilities: GROUND,
    patrol: { cx: 300, cy: 545, rx: 90, ry: 28, period: 60 },
    home: { x: 445, y: 615 },
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

/** Orders a holder of `fleet:command.flight` may give: moving the drone, in the air or on the ground. */
export const FLIGHT_ACTIONS = new Set(["takeoff", "patrol", "land", "start", "drive", "back"]);

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
  /** Which drones have this button. */
  types: DroneType[];
}

/** The drone console's buttons. A `local` action is decided by the drone's own certificate; a
 *  `fleet` action also has to be accepted by the peers it is sent to. */
export const DRONE_ACTIONS: DroneAction[] = [
  { id: "takeoff", label: "Décoller", capability: "drone:flight.takeoff", scope: "local", effect: "Le drone décolle.", types: ["air"] },
  { id: "patrol", label: "Patrouiller", capability: "drone:flight.patrol", scope: "local", effect: "Le drone rejoint son circuit de patrouille.", types: ["air"] },
  { id: "land", label: "Retour base", capability: "drone:flight.land", scope: "local", effect: "Le drone rentre et se pose.", types: ["air"] },
  { id: "start", label: "Démarrer", capability: "drone:drive.start", scope: "local", effect: "Le drone terrestre quitte la base.", types: ["ground"] },
  { id: "drive", label: "Patrouiller", capability: "drone:drive.patrol", scope: "local", effect: "Le drone terrestre suit son circuit de patrouille.", types: ["ground"] },
  { id: "back", label: "Retour base", capability: "drone:drive.return", scope: "local", effect: "Le drone terrestre rentre à la base.", types: ["ground"] },
  { id: "capture", label: "Capturer une image", capability: "drone:sensor.capture", scope: "local", effect: "Image capturée par le capteur EO/IR.", types: ["air", "ground"] },
  { id: "payload", label: "Larguer la charge", capability: "drone:payload.release", scope: "local", effect: "Charge larguée.", types: ["air"] },
  { id: "deliver", label: "Livrer le matériel", capability: "drone:cargo.deliver", scope: "local", effect: "Matériel livré au point de rendez-vous.", types: ["ground"] },
  { id: "geofence", label: "Sortir de la zone autorisée", capability: "drone:geofence.override", scope: "local", effect: "Géorepérage désactivé.", types: ["air", "ground"] },
  { id: "exfil", label: "Envoyer vers Internet", capability: "internet_access", scope: "local", effect: "Données envoyées hors du réseau de la mission.", types: ["air", "ground"] },
  { id: "share", label: "Partager sa position", capability: "fleet:telemetry.share", scope: "fleet", effect: "Position diffusée à la flotte.", types: ["air", "ground"] },
  { id: "intel", label: "Image → Analyste IA", capability: "fleet:intel.share", scope: "fleet", effect: "Image transmise à l'analyste IA.", types: ["air", "ground"] },
  { id: "order", label: "Ordonner à RAPACE-03", capability: "fleet:command", scope: "fleet", effect: "Ordre transmis à RAPACE-03.", types: ["air", "ground"] },
];

export function actionsFor(type: DroneType): DroneAction[] {
  return DRONE_ACTIONS.filter((a) => a.types.includes(type));
}

/** What a recipient requires of the sender, per message type on the fleet mesh. */
export const MESSAGE_REQUIREMENT: Record<string, string> = {
  telemetry: "fleet:telemetry.share",
  intel: "fleet:intel.share",
  command: "fleet:command",
};

export function requirementFor(messageType: string): string | null {
  return MESSAGE_REQUIREMENT[messageType] ?? null;
}
