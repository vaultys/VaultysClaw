/**
 * Unit tests for the notifier's recipient/preference resolution and rendering
 * (packages/notifier/src/{recipients,render}.ts). Uses an in-memory stub for the
 * DB surface so the level → audience routing and preference fallback are tested
 * without Prisma.
 */

import { describe, it, expect } from "vitest";
import {
  resolveRecipients,
  resolvePrefs,
  normalizeRole,
  isAdmin,
  isOwner,
  type NotifierDb,
} from "../packages/notifier/src/recipients";
import { renderNotification } from "../packages/notifier/src/render";

type UserRow = { id: string; email: string | null; role: string | null };

function makeDb(
  users: UserRow[],
  prefs: Record<string, { inApp: boolean; email: boolean; push: boolean }> = {}
): NotifierDb {
  return {
    user: {
      findUnique: async ({ where }) =>
        users.find((u) => u.id === where.id) ?? null,
      findMany: async () => users,
    },
    notificationPreference: {
      findUnique: async ({ where }) =>
        prefs[
          `${where.userId_eventType.userId}:${where.userId_eventType.eventType}`
        ] ?? null,
    },
  };
}

const USERS: UserRow[] = [
  { id: "owner-1", email: "owner@x.com", role: "Owner" },
  { id: "admin-1", email: "admin@x.com", role: "Admin" },
  { id: "member-1", email: "m1@x.com", role: "Member" },
  { id: "member-2", email: null, role: "member" }, // legacy lowercase
];

describe("role helpers", () => {
  it("normalizeRole folds legacy/case variants", () => {
    expect(normalizeRole("owner")).toBe("Owner");
    expect(normalizeRole("ADMIN")).toBe("Admin");
    expect(normalizeRole("cto")).toBe("Member");
    expect(normalizeRole(null)).toBe("Member");
  });

  it("isAdmin includes Owner, isOwner does not include Admin", () => {
    expect(isAdmin("Owner")).toBe(true);
    expect(isAdmin("Admin")).toBe(true);
    expect(isAdmin("Member")).toBe(false);
    expect(isOwner("Owner")).toBe(true);
    expect(isOwner("Admin")).toBe(false);
  });
});

describe("resolveRecipients", () => {
  it("user-level → the single target user (targetUserId)", async () => {
    const db = makeDb(USERS);
    const r = await resolveRecipients(db, {
      eventType: "workspace.member_added",
      data: { targetUserId: "member-1" },
    });
    expect(r).toEqual([{ id: "member-1", email: "m1@x.com" }]);
  });

  it("user-level → falls back to data.userId", async () => {
    const db = makeDb(USERS);
    const r = await resolveRecipients(db, {
      eventType: "workspace.member_removed",
      data: { userId: "member-2" },
    });
    expect(r).toEqual([{ id: "member-2", email: null }]);
  });

  it("user-level → empty when target missing", async () => {
    const db = makeDb(USERS);
    expect(
      await resolveRecipients(db, {
        eventType: "workspace.member_added",
        data: {},
      })
    ).toEqual([]);
  });

  it("admin-level → all Admins and Owners", async () => {
    const db = makeDb(USERS);
    const r = await resolveRecipients(db, {
      eventType: "user.joined",
      data: { userId: "member-1" },
    });
    expect(r.map((x) => x.id).sort()).toEqual(["admin-1", "owner-1"]);
  });

  it("unknown event → no recipients", async () => {
    const db = makeDb(USERS);
    expect(
      await resolveRecipients(db, { eventType: "nope", data: {} })
    ).toEqual([]);
  });
});

describe("resolvePrefs", () => {
  it("returns explicit stored preferences when present", async () => {
    const db = makeDb(USERS, {
      "member-1:workspace.member_added": { inApp: false, email: true, push: true },
    });
    const p = await resolvePrefs(db, "member-1", "workspace.member_added", [
      "inApp",
    ]);
    expect(p).toEqual({ inApp: false, email: true, push: true });
  });

  it("falls back to catalog defaults when no explicit row", async () => {
    const db = makeDb(USERS);
    const p = await resolvePrefs(db, "member-1", "workspace.member_added", [
      "inApp",
    ]);
    expect(p).toEqual({ inApp: true, email: false, push: false });
  });
});

describe("renderNotification", () => {
  it("renders workspace membership events with the workspace name", () => {
    expect(
      renderNotification("workspace.member_added", { workspaceName: "Marketing" })
    ).toEqual({
      title: "Added to a workspace",
      body: 'You were added to "Marketing".',
    });
    expect(
      renderNotification("workspace.member_removed", {}).body
    ).toContain("a workspace");
  });

  it("renders user.joined with name/email/fallback", () => {
    expect(renderNotification("user.joined", { name: "Alice" }).body).toBe(
      "Alice joined VaultysClaw."
    );
    expect(renderNotification("user.joined", { email: "b@x.com" }).body).toBe(
      "b@x.com joined VaultysClaw."
    );
    expect(renderNotification("user.joined", {}).body).toBe(
      "A new user joined VaultysClaw."
    );
  });
});
