import { APIRequestContext, expect } from "@playwright/test";
import { defineVideo } from "../factory";

/**
 * The ECW demonstrator (packages/simulator/ECW_DEMO.md), filmed: the 3D fleet; mission prep, where
 * a new drone is enrolled on screen and a new pilot through a real control-plane invitation opened
 * on a "tablet" (a second browser); orders allowed and refused by certificate from the C2, for the
 * aerial drone and the ground one; the field pilot's movement-only right; the third party on the
 * radio and then inside RAPACE-07; and the revocation that cuts it off from the fleet.
 *
 * It films the demonstrator at localhost:3012, not the console, so it runs from its own config
 * (`playwright.ecw.config.ts`) against the simulator's stack. The demonstrator's UI is French in
 * every language; the voice and subtitles follow the language.
 *
 * No `demo.label`: pinned labels are burnt in by ffmpeg's `subtitles` filter, which needs an
 * ffmpeg built with libass — and the page already says whose screen it is (header, active tab).
 */

type Console = {
  status: string;
  flight: string;
  mode: string;
  revokedAt: number | null;
  staple: { status: string } | null;
  pending: { inConsole: boolean } | null;
};
type State = {
  consoles: Record<string, Console>;
  enrolment: { drone: { runtime: string; approvedAt: number | null }; human: { invite: { url: string } | null } };
};

const DRONES = ["rapace-07", "ugv-01"];

/** The demonstrator's own controls, as its pages call them: a per-run token from the page, and its origin. */
async function presenter(api: APIRequestContext) {
  const html = await (await api.get("/drone")).text();
  const token = html.match(/const TOKEN = "([a-f0-9]+)"/)?.[1];
  if (!token) throw new Error("No demonstrator token on /drone: is `pnpm demo:ecw` the server on 3012?");
  const post = async (path: string, data: object = {}) => {
    const res = await api.post(path, { data, headers: { "X-Demo-Token": token, Origin: "http://localhost:3012" } });
    if (!res.ok()) throw new Error(`${path}: ${res.status()} ${await res.text()}`);
  };
  const state = async () => (await (await api.get("/state")).json()) as State;
  return { post, state };
}

/**
 * Both console drones certified, at the base, taking orders from the C2, RAPACE-07 selected, and a
 * fresh newcomer waiting for the officer: where the film starts, and where it leaves the stand.
 */
async function cleanSlate(api: APIRequestContext) {
  const { post, state } = await presenter(api);
  for (const key of DRONES) {
    const c = (await state()).consoles[key];
    if (c.revokedAt || (c.status !== "certifié" && !c.pending)) await post("/reset", { key });
    await post("/mode", { key, mode: "operator" });
    // A renewed identity waits for an administrator in the console. The film has none signed in,
    // so it uses the stand shortcut — the console path is the demonstrator's to show, not this setup's.
    await expect.poll(async () => (await state()).consoles[key].status !== "connexion", { timeout: 30_000 }).toBe(true);
    if ((await state()).consoles[key].pending) await post("/approve", { key });
  }
  await post("/enroll/reset");
  await expect
    .poll(async () => {
      const s = await state();
      const drones = DRONES.every((k) => s.consoles[k].status === "certifié" && s.consoles[k].staple?.status === "active");
      return drones && s.enrolment.drone.runtime === "pending_approval";
    }, { timeout: 60_000, intervals: [1000] })
    .toBe(true);
  for (const key of DRONES) {
    if ((await state()).consoles[key].flight !== "ground") await post("/action", { key, id: key === "ugv-01" ? "back" : "land" });
  }
  await post("/select", { key: "rapace-07" });
}

defineVideo(
  __filename,
  "the ECW demonstrator: a fleet that refuses what it is not allowed to do",
  async (demo) => {
    const { page } = demo;
    await cleanSlate(demo.admin);

    const act = (panel: string, id: string) => page.locator(`#${panel}-actions .act[data-id="${id}"]`);
    const tab = (name: string) => page.locator(`.tab[data-tab="${name}"]`);
    const pick = (key: string) => page.locator(`.pick[data-key="${key}"]`);
    const toFleet = async () => {
      await demo.click(page.locator('header nav a[href="/"]'));
      await page.locator("#scene canvas").waitFor();
      await page.locator("#scene").evaluate((el) => el.scrollIntoView({ block: "center" }));
    };
    const toDrone = async () => {
      await demo.click(page.locator('header nav a[href="/drone"]'));
      await page.locator(".pick").first().waitFor();
    };

    try {
      // The fleet: let the camera's fly-in finish before the film starts.
      // Cinema mode: the theatre fills the frame (and stays on for the tab, across the nav links).
      await page.goto("/?cinema");
      await page.locator("#scene canvas").waitFor();
      await page.locator("#scene").evaluate((el) => el.scrollIntoView({ block: "center" }));
      await demo.pause(4500);
      await demo.start();
      await demo.say("fleet");
      const messages = demo.say("messages");
      await demo.moveAt(560, 330);
      await demo.pause(2500);
      await demo.moveAt(760, 420);
      await messages;

      // Mission prep: a new drone, enrolled on screen.
      await toDrone();
      await demo.click(tab("prep"));
      const enrollDrone = demo.say("enrollDrone");
      await demo.pause(1500);
      await demo.hover(page.locator("#enroll-steps li").nth(0));
      await demo.pause(2500);
      await demo.hover(page.locator("#enroll-steps li").nth(1));
      await enrollDrone;
      const enrollApprove = demo.say("enrollApprove");
      await demo.click(page.locator("#enroll-approve"));
      await expect(page.locator("#enroll-ready")).toHaveClass(/on/, { timeout: 30_000 });
      await demo.hover(page.locator("#enroll-ready"));
      await enrollApprove;

      // ...and a new pilot, through a real invitation opened on a tablet: another browser.
      const enrollHuman = demo.say("enrollHuman");
      await demo.click(page.locator("#enroll-invite"));
      const link = page.locator("#invite-link");
      await expect(link).toBeVisible();
      await demo.hover(link);
      const url = (await link.getAttribute("href"))!;
      const tablet = await demo.openBrowser();
      await tablet.goto(url);
      const console = page;
      await demo.follow(tablet);
      await demo.pause(1200);
      await demo.click(tablet.getByRole("button", { name: "Use a VaultysID in this browser instead" }));
      await tablet.waitForURL((u) => u.pathname.startsWith("/portal"), { timeout: 60_000 });
      await enrollHuman;
      const done = demo.say("enrollHumanDone");
      await demo.pause(800);
      await demo.hover(tablet.getByText("portal_access").first());
      await done;
      await demo.follow(console);
      await expect(page.locator("#human-ready")).toHaveClass(/on/, { timeout: 20_000 });
      await demo.hover(page.locator("#human-ready"));
      await demo.pause(1500);

      // The C2 and the aerial drone: one order it may carry out, one it may not.
      await demo.click(tab("c2"));
      await expect(act("c2", "takeoff")).toBeVisible();
      const c2 = demo.say("c2");
      await demo.pause(1500);
      await demo.click(act("c2", "takeoff"));
      await demo.pause(1200);
      await demo.click(act("c2", "patrol"));
      await c2;
      const payload = demo.say("payload");
      await demo.click(act("c2", "payload"));
      await demo.pause(800);
      await demo.hover(page.locator("#trace"));
      await payload;

      // The ground drone: same certificates, its own rights.
      await demo.click(pick("ugv-01"));
      await expect(act("c2", "start")).toBeVisible();
      const ground = demo.say("ground");
      await demo.pause(1000);
      await demo.click(act("c2", "start"));
      await demo.pause(1200);
      await demo.click(act("c2", "deliver"));
      await demo.pause(1200);
      await demo.click(act("c2", "geofence"));
      await demo.pause(600);
      await demo.hover(page.locator("#trace"));
      await ground;

      // The field pilot: movement orders only.
      await demo.click(tab("human"));
      const pilot = demo.say("pilot");
      await demo.pause(2200);
      await demo.click(act("human", "back"));
      await demo.pause(1800);
      await demo.click(act("human", "capture"));
      await demo.pause(600);
      await demo.hover(page.locator("#trace"));
      await pilot;

      // The third party on the radio, against RAPACE-07: a forged order, then a genuine one replayed.
      await demo.click(pick("rapace-07"));
      await demo.click(tab("attack"));
      const radio = demo.say("radio");
      await demo.pause(1500);
      await demo.click(act("attack", "payload"));
      await demo.pause(1500);
      await demo.click(page.locator('#attack-actions .act[data-replay="1"]'));
      await demo.pause(600);
      await demo.hover(page.locator("#trace"));
      await radio;

      // Meanwhile, it attacks every drone in range: shields on the map.
      await toFleet();
      await demo.say("radioFleet", { gapAfter: 1800 });

      // Inside RAPACE-07: believed within its rights, refused beyond them.
      await toDrone();
      await expect(tab("attack")).toHaveClass(/on/);
      await demo.click(page.locator('.switch button[data-mode="compromised"]'));
      const compromised = demo.say("compromised");
      await demo.pause(1200);
      await demo.click(act("attack", "share"));
      await demo.pause(2200);
      await demo.click(page.locator("#attack-actions .act.evil"));
      await demo.pause(800);
      await demo.hover(page.locator("#trace"));
      await compromised;

      // The revocation, and the countdown to isolation.
      const revoke = demo.say("revoke");
      await demo.click(page.locator("#revoke"));
      await demo.hover(page.locator("#timeline"));
      await expect(page.locator("#timeline")).toContainText("Isolé de la flotte", { timeout: 20_000 });
      await revoke;
      await demo.pause(1200);

      // Cut off, in a quarantine bubble, while the fleet flies on.
      await toFleet();
      await demo.click(page.locator("#view-follow"));
      await demo.say("isolated", { gapAfter: 1500 });
      demo.end();
    } finally {
      // Never leave the stand on a revoked drone, with the attacker active, or the newcomer enrolled.
      await cleanSlate(demo.admin);
    }
  },
  { signedIn: false },
);
