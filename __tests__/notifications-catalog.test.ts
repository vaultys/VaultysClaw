/**
 * Unit tests for the shared notification catalog (packages/shared/src/notifications.ts):
 *   - getNotificationEvent lookup
 *   - eventsForRole filtering by audience level
 *   - userNotificationChannel formatting
 *   - catalog invariants
 */

import { describe, it, expect } from "vitest";
import {
  NOTIFICATION_EVENTS,
  LEVELS_FOR_ROLE,
  getNotificationEvent,
  eventsForRole,
  userNotificationChannel,
  NOTIFICATION_QUEUE_NAME,
} from "@vaultysclaw/shared";

describe("notification catalog", () => {
  it("getNotificationEvent resolves known types and returns undefined otherwise", () => {
    expect(getNotificationEvent("workspace.member_added")?.level).toBe("user");
    expect(getNotificationEvent("user.joined")?.level).toBe("admin");
    expect(getNotificationEvent("does.not.exist")).toBeUndefined();
  });

  it("eventsForRole filters by role hierarchy", () => {
    const member = eventsForRole("Member").map((e) => e.type);
    const admin = eventsForRole("Admin").map((e) => e.type);
    const owner = eventsForRole("Owner").map((e) => e.type);

    // Member only sees user-level events
    expect(member).toContain("workspace.member_added");
    expect(member).not.toContain("user.joined");

    // Admin sees user + admin
    expect(admin).toContain("workspace.member_added");
    expect(admin).toContain("user.joined");

    // Owner sees everything an admin sees (superset)
    for (const t of admin) expect(owner).toContain(t);
  });

  it("eventsForRole defaults unknown roles to Member scope", () => {
    const unknown = eventsForRole("Weird").map((e) => e.type);
    const member = eventsForRole("Member").map((e) => e.type);
    expect(unknown).toEqual(member);
  });

  it("userNotificationChannel is namespaced per user", () => {
    expect(userNotificationChannel("abc")).toBe("notif:user:abc");
    expect(userNotificationChannel("x")).not.toBe(userNotificationChannel("y"));
  });

  it("every catalog event is visible to Owner and has valid defaults", () => {
    for (const ev of NOTIFICATION_EVENTS) {
      expect(LEVELS_FOR_ROLE.Owner).toContain(ev.level);
      for (const ch of ev.defaultChannels) {
        expect(["inApp", "email", "push"]).toContain(ch);
      }
    }
  });

  it("exposes a stable queue name", () => {
    expect(NOTIFICATION_QUEUE_NAME).toBe("notifications");
  });
});
