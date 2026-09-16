/**
 * The people the fleet belongs to.
 *
 * Every simulated Actor used to belong to nobody, which quietly made the demo about the wrong
 * thing: the console's whole framing is that humans are Actors like any other (`kind: "human"`, no
 * role column, access is a ledger lookup), and a database with 7,000 agents and zero people cannot
 * show that. It also leaves `/admin/graph` drawing a field of unconnected dots, and the actor
 * detail page's "owner" row permanently empty.
 *
 * So the simulator now mints a population as well as a fleet. Like the admin identity, these are
 * **real** VaultysIds — generated with the same `loadOrCreateIdentity` the fleet uses, persisted in
 * the same format, holding a real control-plane-signed certificate. What they are not is
 * *connected*: `human` is the one kind onboarded through login rather than the WS registration
 * handshake (`lib/actor-kinds.ts`), so driving one over `ActorRuntime` would be simulating a path
 * that does not exist. They are written into the ledger the way the login path writes them, and
 * their keys sit on disk ready to be loaded into a browser.
 */

import path from "node:path";
import { loadOrCreateIdentity } from "@vaultysclaw/sdk";
import type { AgentCapability } from "@vaultysclaw/policy";

/**
 * What every simulated human's email ends with, and the scope every database operation on this
 * population uses.
 *
 * `.invalid` is reserved by RFC 2606 and can never be a real domain, so this is a marker that
 * cannot collide with a real person's address no matter whose database the simulator is
 * (mistakenly) pointed at. It plays the same role the `openclaw-`/`sensor-` name prefixes play for
 * the fleet — but better, because it leaves the *display* name free to be an actual name. An
 * ownership demo whose every owner is called "human-00042" answers the question "whose agent is
 * this?" with another question.
 */
export const SIM_EMAIL_DOMAIN = "sim.invalid";

/** What a simulated human is granted: the Access Portal, and nothing else.
 *
 *  `portal_access` is the interface right an ordinary employee has — it is what makes the identity
 *  usable at all, and it is *not* `admin_console_access`, which stays the deliberate act
 *  `simulator admin` performs. A population of 1,400 admins would be a worse demo than a population
 *  of none. */
export const HUMAN_CAPABILITIES: AgentCapability[] = ["portal_access"];

export interface SimHuman {
  index: number;
  did: string;
  name: string;
  email: string;
  /** Base64 raw public key, for `Actor.publicKey` — normally captured from the handshake. */
  publicKey: string;
}

/**
 * Load or generate the human population, in index order.
 *
 * Identities persist under `<data-dir>/human-NNNNN/identity`, exactly like fleet members and for
 * exactly the same reason: a rerun that minted fresh keys would orphan every ownership edge the
 * previous run drew, and the second run would look nothing like the first. Generation is ~4.7 ms
 * apiece, so a first run of a thousand people costs a few seconds; every run after that is a file
 * read.
 */
export async function loadPeople(
  dataDir: string,
  count: number,
  onProgress?: (done: number, total: number) => void
): Promise<SimHuman[]> {
  const people: SimHuman[] = [];
  for (let i = 0; i < count; i++) {
    const identityPath = path.join(dataDir, `human-${String(i).padStart(5, "0")}`, "identity");
    const id = await loadOrCreateIdentity(identityPath);
    const name = displayName(i);
    people.push({
      index: i,
      did: id.did,
      name,
      email: emailFor(name, i),
      publicKey: Buffer.from(id.id).toString("base64"),
    });
    // Reported every 50 rather than every one: at a thousand people the progress line itself
    // becomes the slow part on a TTY.
    if (onProgress && (i % 50 === 0 || i === count - 1)) onProgress(i + 1, count);
  }
  return people;
}

/**
 * How many people a fleet of this size should have.
 *
 * Neither extreme shows anything. One person per Actor is not an org, it is a list; ten people
 * owning seven thousand things is not an org either. Around five owned Actors per person — a
 * laptop, the machine a sensor runs on, a coding agent, an MCP server or two — is the shape of a
 * real estate, and it is also the density at which the graph is still readable.
 */
export function defaultHumanCount(fleetSize: number): number {
  return Math.max(1, Math.round(fleetSize / 5));
}

/**
 * A name, from a first/last pool.
 *
 * The pools are French because the rest of the demo is (see `locations.ts`'s regional network), and
 * a fleet whose map is Bpifrance's offices and whose owners are all called Smith reads as two
 * different demos stapled together.
 *
 * The surname stride is the part that is not obvious. Advancing it once per pass through the first
 * names — the natural way to enumerate a product — pairs every low index with the *same* surname,
 * and `ownership.ts` skews ownership toward low indices, so the busiest dozen owners on the graph
 * all turned out to be called Martin. It looked like a bug in the generator. Striding by
 * `FIRST_NAMES.length + 1` instead gives consecutive people different surnames, and still visits
 * every (first, last) pair exactly once before repeating — that holds precisely because the stride
 * and `LAST_NAMES.length` are coprime, which is what the `gcd(49, 60) === 1` in the test pins.
 *
 * Past `FIRST_NAMES.length * LAST_NAMES.length` people, names repeat. That is fine and deliberately
 * not papered over with a numeric suffix: two people with the same name is something a real
 * directory has, and the *email* — which is what is unique in the schema — stays unique regardless.
 */
export function displayName(index: number): string {
  const first = FIRST_NAMES[index % FIRST_NAMES.length];
  const pass = Math.floor(index / FIRST_NAMES.length);
  const slot = (pass * (FIRST_NAMES.length + 1) + (index % FIRST_NAMES.length)) % LAST_NAMES.length;
  return `${first} ${LAST_NAMES[slot]}`;
}

/** `prenom.nom42@sim.invalid` — accent-folded, and carrying the index so it is unique even when
 *  two people share a name. `User.email` is unique in the schema, so a collision here is not a
 *  cosmetic problem: it fails the insert. */
export function emailFor(name: string, index: number): string {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, ".");
  return `${slug}${index}@${SIM_EMAIL_DOMAIN}`;
}

const FIRST_NAMES = [
  "Camille",
  "Julien",
  "Aurélie",
  "Thomas",
  "Léa",
  "Nicolas",
  "Manon",
  "Sébastien",
  "Chloé",
  "Guillaume",
  "Émilie",
  "Maxime",
  "Sarah",
  "Antoine",
  "Malik",
  "Rachid",
  "Inès",
  "Étienne",
  "Fatou",
  "Vincent",
  "Noémie",
  "Karim",
  "Élodie",
  "Baptiste",
  "Amandine",
  "Olivier",
  "Salomé",
  "Hugo",
  "Marion",
  "Pierre-Yves",
  "Djamila",
  "Yann",
  "Clémence",
  "Farid",
  "Anaïs",
  "Grégoire",
  "Lucie",
  "Mehdi",
  "Perrine",
  "Arnaud",
  "Solène",
  "Tanguy",
  "Zoé",
  "Bastien",
  "Nadia",
  "Loïc",
  "Margaux",
  "Sofiane",
] as const;

const LAST_NAMES = [
  "Martin",
  "Bernard",
  "Dubois",
  "Barbier",
  "Robert",
  "Richard",
  "Petit",
  "Durand",
  "Leroy",
  "Moreau",
  "Simon",
  "Laurent",
  "Lefebvre",
  "Michel",
  "Garcia",
  "David",
  "Bertrand",
  "Roux",
  "Brun",
  "Fournier",
  "Morel",
  "Girard",
  "Andre",
  "Lefèvre",
  "Mercier",
  "Dupont",
  "Lambert",
  "Bonnet",
  "François",
  "Martinez",
  "Legrand",
  "Garnier",
  "Faure",
  "Rousseau",
  "Blanc",
  "Guerin",
  "Muller",
  "Henry",
  "Roussel",
  "Leroux",
  "Perrin",
  "Morin",
  "Mathieu",
  "Clément",
  "Gauthier",
  "Dumont",
  "Lopez",
  "Fontaine",
  "Chevalier",
  "Robin",
  "Masson",
  "Sanchez",
  "Gérard",
  "Nguyen",
  "Boyer",
  "Denis",
  "Lemaire",
  "Duval",
  "Joly",
  "Gautier",
] as const;

// The two pools are kept **disjoint**: several of the commonest French surnames — Thomas, Vincent,
// Nicolas — are also first names, and leaving them in both produced "Thomas Thomas" three times in
// the enumeration. Substituting a surname that is not also a given name is the fix; patching the
// output afterwards is not, because the pair it would move to is one another index legitimately
// owns, so it trades a silly name for a duplicate one.
