import { expect } from "@playwright/test";
import { defineVideo } from "../factory";

/** The simulated population's busiest owner (simulator ownership is by hash of the DID: stable across runs). */
const OWNER = "Aurélie Dubois";

/**
 * The console footage the marketing video (marketing/) plays inside its browser windows: no
 * narration, no render — only `.generated-videos/screens/marketing-screens.en.mp4` and its marks,
 * one per shot. English only: the console is, whatever the language of the voice over it.
 * Each mark is set once its screen has loaded (a shot opening on a blank page reads as a bug).
 */
defineVideo(
  __filename,
  "console footage for the marketing video",
  async (demo) => {
    const { page } = demo;
    const nav = (href: string) => page.locator(`nav a[href="${href}"]`).first();
    const main = page.locator("main");
    const point = async (text: string) => {
      const box = (await main.getByText(text, { exact: true }).first().boundingBox())!;
      await demo.moveAt(box.x + box.width / 2, box.y + box.height / 2);
    };

    await page.goto("/admin");
    await expect(main.getByText("Active certificates", { exact: true })).toBeVisible();
    await demo.start();

    demo.mark("overview");
    for (const label of ["Actors", "Pending approval", "Active certificates"]) {
      await point(label);
      await demo.pause(1400);
    }

    await demo.click(page.locator("nav").getByRole("button", { name: /Actors/ }));
    await demo.click(nav("/admin/actors?tab=pending"));
    const card = page.locator("form").filter({ has: page.getByRole("checkbox", { name: "internet_access" }) }).first();
    await expect(card).toBeVisible();
    demo.mark("approve");
    await demo.pause(800);
    await demo.click(card.getByRole("checkbox", { name: "file_read" }));
    await demo.click(card.getByRole("checkbox", { name: "internet_access" }));
    await demo.pause(500);
    await demo.click(card.getByRole("button", { name: "Approve" }));
    await demo.pause(2000);

    await demo.click(nav("/admin/certificates"));
    await expect(page.locator("tbody tr").first()).toBeVisible();
    demo.mark("certificates");
    const row = page.locator("tbody tr").first();
    await demo.hover(row.getByText("active", { exact: true }));
    await demo.pause(1500);
    await demo.hover(row.getByRole("button", { name: "Revoke" }));
    await demo.pause(2500);

    await demo.click(nav("/admin/graph"));
    await demo.pause(2500);
    demo.mark("graph");
    await demo.type(page.getByPlaceholder(/Find by name/), OWNER);
    await page.locator("canvas").first().evaluate((c) => c.scrollIntoView({ block: "center", behavior: "smooth" }));
    await demo.pause(1500);
    demo.mark("graph-owner");
    await demo.moveAt(760, 400);
    await demo.pause(5000);

    await demo.click(nav("/admin/map"));
    await demo.pause(2500);
    demo.mark("map");
    await demo.moveAt(760, 380);
    await demo.pause(4000);

    // The kill switch: armed, the banner across the console, then disarmed. Always disarmed, even
    // if a step fails: an armed switch left in the database suspends the whole fleet.
    await demo.click(nav("/admin/settings"));
    const arm = page.getByRole("button", { name: "Arm kill switch…" });
    await expect(arm).toBeVisible();
    demo.mark("killswitch");
    try {
      await demo.pause(800);
      await demo.click(arm);
      await demo.type(page.getByLabel(/Reason/), "Abnormal behaviour across the agent fleet");
      await demo.type(page.getByLabel(/to confirm/), "ARM");
      await demo.click(page.getByRole("button", { name: "Arm now" }));
      await expect(page.getByText("Kill switch armed").first()).toBeVisible();
      demo.mark("killswitch-armed");
      await demo.pause(4000);
      await demo.click(page.getByRole("button", { name: "Disarm" }));
      await expect(page.getByText("Kill switch armed")).toHaveCount(0);
      demo.mark("killswitch-disarmed");
      await demo.pause(2000);
    } finally {
      const disarm = page.getByRole("button", { name: "Disarm" });
      if (await disarm.isVisible()) await disarm.click();
    }

    await demo.click(nav("/admin/audit"));
    await expect(main.getByText("Audit explorer")).toBeVisible();
    await demo.pause(1200);
    demo.mark("audit");
    await demo.moveAt(640, 300);
    await demo.pause(2000);
    await main.evaluate((m) => m.scrollBy({ top: 420, behavior: "smooth" }));
    await demo.pause(1200);
    demo.mark("audit-table");
    await demo.moveAt(700, 480);
    await demo.pause(4000);
    demo.end();
  },
  { languages: ["en"], screensOnly: true },
);
