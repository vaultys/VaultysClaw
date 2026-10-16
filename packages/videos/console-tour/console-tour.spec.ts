import { expect } from "@playwright/test";
import { defineVideo } from "../factory";

/** The simulated population's busiest owner (simulator ownership is by hash of the DID: stable across runs). */
const OWNER = "Aurélie Dubois";

/**
 * A quick tour of the admin console, on the simulated estate setup/ leaves running: the overview,
 * an approval, the map, the graph, the certificate ledger and the audit log.
 */
defineVideo(__filename, "a one-minute tour of the console", async (demo) => {
  const { page } = demo;
  /** A sidebar entry, by its route: the console's copy may change, its routes do not. */
  const nav = (href: string) => page.locator(`nav a[href="${href}"]`).first();

  await page.goto("/admin");
  await expect(page.getByText("Active certificates", { exact: true })).toBeVisible();
  await demo.start();

  await demo.say("overview");
  const glance = demo.say("glance");
  // The three counters under the hero, pointed at without scrolling: `hover` scrolls the page
  // (main is the scroll container), and the overview jumped down mid-sentence.
  const counters = page.locator("main");
  for (const label of ["Actors", "Pending approval", "Active certificates"]) {
    const box = (await counters.getByText(label, { exact: true }).first().boundingBox())!;
    await demo.moveAt(box.x + box.width / 2, box.y + box.height / 2);
    await demo.pause(1100);
  }
  await glance;

  // An approval: a registration from the fleet, granted two capabilities on screen.
  // "Actors" is a group in the sidebar: open it, then its "Pending" entry.
  await demo.click(page.locator("nav").getByRole("button", { name: /Actors/ }));
  await demo.click(nav("/admin/actors?tab=pending"));
  // Each pending registration is a form; one with the full capability list, not a sensor's single one.
  const card = page.locator("form").filter({ has: page.getByRole("checkbox", { name: "internet_access" }) }).first();
  const approve = card.getByRole("button", { name: "Approve" });
  await expect(approve).toBeVisible();
  const line = demo.say("approve");
  await demo.pause(1200);
  await demo.click(card.getByRole("checkbox", { name: "file_read" }));
  await demo.click(card.getByRole("checkbox", { name: "internet_access" }));
  await demo.click(approve);
  await line;

  await demo.click(nav("/admin/map"));
  const map = demo.say("map");
  await demo.pause(1500);
  await demo.moveAt(760, 380);
  await map;

  // Whose agent is this: searching a person flies the camera to her, among the twenty things she owns.
  await demo.click(nav("/admin/graph"));
  const graph = demo.say("graph");
  await demo.pause(2500);
  await demo.type(page.getByPlaceholder(/Find by name/), OWNER);
  // The canvas starts below the filters: bring it into the frame, the person at its centre.
  await page.locator("canvas").first().evaluate((c) => c.scrollIntoView({ block: "center", behavior: "smooth" }));
  await demo.pause(1200);
  await demo.moveAt(760, 400);
  await graph;

  await demo.click(nav("/admin/certificates"));
  const certificates = demo.say("certificates");
  await demo.pause(1200);
  const firstRow = page.locator("tbody tr").first();
  await demo.hover(firstRow.getByText("active", { exact: true }));
  await demo.pause(1500);
  await demo.hover(firstRow.getByRole("button", { name: "Revoke" }));
  await certificates;

  await demo.click(nav("/admin/audit"));
  const audit = demo.say("audit");
  await demo.pause(1500);
  await demo.moveAt(640, 300);
  await audit;
  await demo.pause(800);
  demo.end();
});
