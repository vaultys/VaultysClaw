import { Browser, expect, test } from "@playwright/test";
import fs from "fs";
import path from "path";
import { OUTPUT, simulator, spawnSimulator } from "../stack";
import { AUTH, BACKUP, FLEET_LOG, FLEET_PID, IDENTITY } from "./auth";

/**
 * Before any video: a living estate to film, and an admin signed in to film it with.
 *
 * Runs once per `pnpm generate:videos`, against the control plane the config's webServer started.
 * Nothing here is filmed.
 */
test.describe.configure({ mode: "serial" });

/** Sized for the screen, not for load: enough for a dense map and a readable graph, and a ramp of seconds. */
const ESTATE = 400;
const AGENTS = 1000;
const ADMIN_NAME = "Camille Laurent";
const NEWCOMERS = 6;

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** The simulator's last progress line, e.g. `… connected 163  certified 1149  pending 84 …`. */
function progress() {
  const log = fs.existsSync(FLEET_LOG) ? fs.readFileSync(FLEET_LOG, "utf8") : "";
  const last = log.split(/[\r\n]/).filter((l) => l.includes("certified")).pop() ?? "";
  const n = (key: string) => Number(last.match(new RegExp(`${key} (\\d+)`))?.[1] ?? 0);
  return { certified: n("certified"), connected: n("connected"), failed: n("failed"), line: last, log };
}

test("the simulated fleet is up", async () => {
  test.setTimeout(5 * 60 * 1000);
  const running = fs.existsSync(FLEET_PID) && alive(Number(fs.readFileSync(FLEET_PID, "utf8")));
  if (!running) {
    // Until stopped: the Actors stay connected, re-check their grants and send telemetry while
    // the console is filmed. Identities persist (stack.ts SIM_DATA), so a rerun is a reconnect.
    const child = spawnSimulator(
      ["run", "--actors", String(ESTATE), "--agents", String(AGENTS), "--rate", "100", "--max-in-flight", "200", "--duration", "0", "--auto-approve", "--status-refresh", "45000"],
      FLEET_LOG,
    );
    fs.writeFileSync(FLEET_PID, String(child.pid));
  }
  // Most of it certified. The auto-approval only covers the first wave, so a run plateaus around
  // 83 % and the rest stays pending — which is what gives the approval scene something to approve.
  await expect
    .poll(() => {
      const p = progress();
      if (/Error|ECONNREFUSED/.test(p.log) && !p.line) throw new Error(`The fleet did not start:\n${p.log.slice(-2000)}`);
      return p.certified;
    }, { timeout: 4 * 60 * 1000, intervals: [2000] })
    .toBeGreaterThanOrEqual(0.75 * (ESTATE + AGENTS));

  // A few newcomers, never auto-approved, so an approval scene always has an agent waiting: the
  // fleet's own stragglers are approved by its next restart. Fresh identities every run (a pending
  // registration a video approved must not come back), and no people of their own.
  const newcomers = path.join(OUTPUT, ".newcomers");
  fs.rmSync(newcomers, { recursive: true, force: true });
  spawnSimulator(["run", "--actors", "0", "--agents", String(NEWCOMERS), "--humans", "0", "--duration", "40"], path.join(OUTPUT, "newcomers.log"), newcomers);
  await expect
    .poll(() => (fs.existsSync(path.join(OUTPUT, "newcomers.log")) ? fs.readFileSync(path.join(OUTPUT, "newcomers.log"), "utf8") : "").match(/pending (\d+)/g)?.pop() ?? "", {
      timeout: 60_000,
    })
    .toBe(`pending ${NEWCOMERS}`);
});

/** Mints a fresh admin (`pnpm simulator admin`) and keeps its browser-held VaultysID. */
function mintAdmin() {
  fs.mkdirSync(path.dirname(IDENTITY), { recursive: true });
  simulator(["admin", "--passphrase", "video-demo-only", "--name", ADMIN_NAME, "--out", BACKUP]);
  const snippet = fs.readFileSync(`${BACKUP}.load-in-browser.js`, "utf8");
  const identity = snippet.match(/d=(\{.*?\});/)?.[1];
  if (!identity) throw new Error(`Unexpected snippet from simulator admin: ${snippet.slice(0, 200)}`);
  fs.writeFileSync(IDENTITY, identity, { mode: 0o600 });
}

/** Signs in on /login with the identity in localStorage, as a person would: one click, no wallet. */
async function signIn(browser: Browser) {
  const identity = JSON.parse(fs.readFileSync(IDENTITY, "utf8"));
  const context = await browser.newContext();
  await context.addInitScript((d) => {
    localStorage.setItem("vaultysclaw:devIdentities", JSON.stringify([d]));
    localStorage.setItem("vaultysclaw:activeDevIdentityDid", d.did);
  }, identity);
  const page = await context.newPage();
  try {
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign in with a VaultysID in this browser" }).click();
    await page.waitForURL(/\/admin(\/|$)/, { timeout: 30_000 });
    await context.storageState({ path: AUTH });
    return true;
  } catch {
    return false;
  } finally {
    await context.close();
  }
}

test("the admin is signed in", async ({ browser }) => {
  test.setTimeout(2 * 60 * 1000);
  // A key minted on an earlier run works until the volume is nuked: then mint another.
  if (fs.existsSync(IDENTITY) && (await signIn(browser))) return;
  mintAdmin();
  expect(await signIn(browser), "the freshly minted admin could not sign in").toBe(true);
});
