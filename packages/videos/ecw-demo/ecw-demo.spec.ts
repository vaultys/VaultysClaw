import { APIRequestContext, expect } from "@playwright/test";
import { defineVideo } from "../factory";

/**
 * The ECW demonstrator (packages/simulator/ECW_DEMO.md), filmed: the 3D fleet, orders allowed and
 * refused by certificate from the C2 and the field pilot, the third party on the radio and then
 * inside RAPACE-07, and the revocation that cuts it off from the fleet.
 *
 * It films the demonstrator at localhost:3012, not the console, so it runs from its own config
 * (`playwright.ecw.config.ts`) against the simulator's stack. The demonstrator's UI is French in
 * every language; the voice and subtitles follow the language.
 *
 * No `demo.label`: pinned labels are burnt in by ffmpeg's `subtitles` filter, which needs an
 * ffmpeg built with libass — and the page already says whose screen it is (header, active tab).
 */

type State = {
  spotlight: { status: string; flight: string; mode: string; revokedAt: number | null; isolatedAt: number | null; staple: { status: string } | null };
};

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

/** RAPACE-07 certified, on the ground, taking orders from the C2: where the film starts and where it leaves the stand. */
async function cleanSlate(api: APIRequestContext) {
  const { post, state } = await presenter(api);
  const s = await state();
  if (s.spotlight.revokedAt || s.spotlight.status !== "certifié") await post("/reset");
  await post("/mode", { mode: "operator" });
  await expect
    .poll(async () => {
      const sp = (await state()).spotlight;
      return sp.status === "certifié" && sp.staple?.status === "active";
    }, { timeout: 60_000, intervals: [1000] })
    .toBe(true);
  if ((await state()).spotlight.flight !== "ground") await post("/action", { id: "land" });
}

defineVideo(
  __filename,
  "the ECW demonstrator: a fleet that refuses what it is not allowed to do",
  async (demo) => {
    const { page } = demo;
    await cleanSlate(demo.admin);

    const act = (panel: string, id: string) => page.locator(`#${panel}-actions .act[data-id="${id}"]`);
    const tab = (name: string) => page.locator(`.tab[data-tab="${name}"]`);
    const toFleet = async () => {
      await demo.click(page.locator('header nav a[href="/"]'));
      await page.locator("#scene canvas").waitFor();
      await page.locator("#scene").evaluate((el) => el.scrollIntoView({ block: "center" }));
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

      // The C2: one order the drone may carry out, one it may not.
      await demo.click(page.locator('header nav a[href="/drone"]'));
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

      // The field pilot: flight orders only.
      await demo.click(tab("human"));
      const pilot = demo.say("pilot");
      await demo.pause(2500);
      await demo.click(act("human", "capture"));
      await demo.pause(800);
      await demo.hover(page.locator("#trace"));
      await pilot;

      // The third party on the radio: a forged order, then a genuine one replayed.
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
      await demo.click(page.locator('header nav a[href="/drone"]'));
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
      // Never leave the stand on a revoked drone or with the attacker active.
      await cleanSlate(demo.admin);
    }
  },
  { signedIn: false },
);
