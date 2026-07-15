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
  notificationAction,
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

describe("notificationAction (click destinations)", () => {
  it("builds workspace-scoped destinations from the payload", () => {
    expect(
      notificationAction("workspace.agent_added", { workspaceId: "ws-1" })
    ).toEqual({ label: "View workspace", path: "/workspaces/ws-1" });
  });

  it("routes workflow outcomes to the run page", () => {
    expect(notificationAction("workflow.failed", { runId: "run-9" })?.path).toBe(
      "/admin/workflows/runs/run-9"
    );
  });

  it("routes admin lifecycle events to their admin pages", () => {
    expect(notificationAction("agent.pending", {})?.path).toBe("/admin/registrations");
    expect(notificationAction("model.added", {})?.path).toBe("/admin/models");
    expect(notificationAction("policy.updated", {})?.path).toBe("/admin/governance");
  });

  it("routes personal events to inbox / settings", () => {
    expect(notificationAction("inbox.message", {})?.path).toBe("/app/inbox");
    expect(notificationAction("profile.updated", {})?.path).toBe(
      "/app/settings/security"
    );
  });

  it("encodes dynamic id segments", () => {
    expect(
      notificationAction("agent.created", { agentDid: "did:vaultys:abc" })?.path
    ).toBe(`/admin/agents/${encodeURIComponent("did:vaultys:abc")}`);
  });

  it("returns null for events with no meaningful destination", () => {
    expect(notificationAction("workspace.member_removed", {})).toBeNull();
    expect(notificationAction("agent.deleted", {})).toBeNull();
    expect(notificationAction("workspace.deleted", {})).toBeNull();
    expect(notificationAction("unknown.event", {})).toBeNull();
  });
});
