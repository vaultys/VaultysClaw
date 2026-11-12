/**
 * The setup token that authorizes **who becomes the first administrator** of a fresh deployment.
 *
 * With no human Actor yet, both login routes hand out a *registration* certificate, and the
 * bootstrap flow grants whoever completes it `admin_console_access`. Without a gate, that is
 * "whoever reaches `/login` first owns the deployment" — a race against anyone who can reach the
 * port. `lib/browser-bootstrap.ts` closed it for browser-minted identities only; the wallet QR path
 * (`/api/public/user/p2p-connect`) stayed open because it was the only way a production install
 * could get an admin at all. This token is that missing authorization, for both transports.
 *
 * Where it comes from, in order:
 *  1. `CONTROLPLANE_BOOTSTRAP_TOKEN` — the operator chose it (and already knows it). Never logged.
 *  2. Otherwise generated at boot while no human exists (`ensureBootstrapToken`, called from
 *     `server.ts`), printed **once** to the server log as a ready-to-open `/login?setup=…` URL, and
 *     persisted only as its sha256. Persisted rather than held in memory because Next.js route
 *     handlers do not reliably share module state with `server.ts`. A restart issues a new one and
 *     the old one stops working.
 *
 * Once any human exists the register branch is unreachable regardless, so the token is dead by
 * construction; boot also deletes the stored hash so nothing stale lingers.
 *
 * Dev and the simulator stack keep their existing opt-in (`isBrowserBootstrapEnabled`) and need no
 * token — see `isBootstrapRegistrationAllowed`.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/db/client";
import { SettingsDAO } from "@/db";
import { isBrowserBootstrapEnabled } from "./browser-bootstrap";

export const BOOTSTRAP_TOKEN_HASH_KEY = "bootstrap.tokenHash";

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Pure, constant-time comparison of a presented token against the stored sha256 (hex). */
export function tokenMatchesHash(candidate: string | null | undefined, expectedHashHex: string | null | undefined): boolean {
  if (!candidate || !expectedHashHex) return false;
  const expected = Buffer.from(expectedHashHex, "hex");
  const actual = sha256(candidate);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function verifyBootstrapToken(candidate: string | null | undefined): Promise<boolean> {
  if (!candidate) return false;
  const configured = process.env.CONTROLPLANE_BOOTSTRAP_TOKEN;
  if (configured) return tokenMatchesHash(candidate, sha256(configured).toString("hex"));
  return tokenMatchesHash(candidate, await SettingsDAO.get(BOOTSTRAP_TOKEN_HASH_KEY));
}

/**
 * Whether an anonymous caller may be handed a registration certificate on a deployment with no
 * human yet. The caller has already established that no human exists.
 */
export async function isBootstrapRegistrationAllowed(setupToken: string | null | undefined): Promise<boolean> {
  if (isBrowserBootstrapEnabled()) return true;
  return verifyBootstrapToken(setupToken);
}

/** Boot-time half: issue (or retire) the token. Returns the setup URL to log, or null. */
export async function ensureBootstrapToken(hasAnyHuman: boolean, baseUrl: string): Promise<string | null> {
  if (hasAnyHuman) {
    await prisma.setting.deleteMany({ where: { key: BOOTSTRAP_TOKEN_HASH_KEY } });
    return null;
  }
  if (process.env.CONTROLPLANE_BOOTSTRAP_TOKEN) return null;
  const token = randomBytes(32).toString("base64url");
  await SettingsDAO.set(BOOTSTRAP_TOKEN_HASH_KEY, sha256(token).toString("hex"));
  return `${baseUrl.replace(/\/$/, "")}/login?setup=${token}`;
}
