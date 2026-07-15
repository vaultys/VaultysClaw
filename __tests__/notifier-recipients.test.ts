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
  prefs: Record<string, { inApp: boolean; email: boolean; push: boolean }> = {},
  memberships: Record<string, string[]> = {} // workspaceId -> userIds
): NotifierDb {
  return {
    user: {
      findUnique: async ({ where }) =>
        users.find((u) => u.id === where.id) ?? null,
      findMany: async () => users,
    },
    userWorkspace: {
      findMany: async ({ where }) =>
        (memberships[where.workspaceId] ?? []).map((userId) => ({ userId })),
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

  it("admin-audience → all Admins and Owners", async () => {
    const db = makeDb(USERS);
    const r = await resolveRecipients(db, {
      eventType: "user.joined",
      data: { userId: "member-1" },
    });
    expect(r.map((x) => x.id).sort()).toEqual(["admin-1", "owner-1"]);
  });

  it("workspaceMembers audience → every member of the workspace", async () => {
    const db = makeDb(USERS, {}, { "ws-1": ["member-1", "admin-1"] });
    const r = await resolveRecipients(db, {
      eventType: "workspace.agent_added",
      data: { workspaceId: "ws-1", agentName: "Bot" },
    });
    expect(r.map((x) => x.id).sort()).toEqual(["admin-1", "member-1"]);
  });

  it("workspaceMembers audience → empty when workspace missing/empty", async () => {
    const db = makeDb(USERS, {}, {});
    expect(
      await resolveRecipients(db, {
        eventType: "workspace.workflow_added",
        data: { workspaceId: "ws-unknown" },
      })
    ).toEqual([]);
  });

  it("unknown event → no recipients", async () => {
    const db = makeDb(USERS);
    expect(
      await resolveRecipients(db, { eventType: "nope", data: {} })
    ).toEqual([]);
  });

  it("excludes the actor from broadcast (admins) audiences", async () => {
    const db = makeDb(USERS);
    const r = await resolveRecipients(db, {
      eventType: "user.joined",
      data: { userId: "x", actorDid: "owner-1" },
    });
    expect(r.map((x) => x.id)).toEqual(["admin-1"]); // owner-1 (actor) excluded
  });

  it("excludes the actor from workspaceMembers audience", async () => {
    const db = makeDb(USERS, {}, { "ws-1": ["member-1", "admin-1"] });
    const r = await resolveRecipients(db, {
      eventType: "workspace.agent_added",
      data: { workspaceId: "ws-1", actorDid: "member-1" },
    });
    expect(r.map((x) => x.id)).toEqual(["admin-1"]); // member-1 (actor) excluded
  });

  it("excludes the actor even for target audience (self-only events notify nobody)", async () => {
    const db = makeDb(USERS);
    const r = await resolveRecipients(db, {
      eventType: "profile.updated",
      data: { targetUserId: "member-1", actorDid: "member-1" },
    });
    expect(r).toEqual([]);
  });

  it("still delivers target events when actor differs from the target", async () => {
    const db = makeDb(USERS);
    const r = await resolveRecipients(db, {
      eventType: "workspace.member_added",
      data: { targetUserId: "member-1", actorDid: "admin-1" },
    });
    expect(r.map((x) => x.id)).toEqual(["member-1"]);
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

  it("renders workspace-scoped entity events", () => {
    expect(
      renderNotification("workspace.agent_added", {
        agentName: "Bot",
        workspaceName: "Ops",
      }).body
    ).toBe('Bot was added to "Ops".');
    expect(
      renderNotification("workspace.workflow_removed", {
        workflowName: "Nightly",
        workspaceName: "Ops",
      }).body
    ).toBe('Nightly was removed from "Ops".');
  });

  it("renders admin lifecycle events", () => {
    expect(renderNotification("workflow.failed", { workflowName: "Sync" }).body).toBe(
      "Sync run failed."
    );
    expect(renderNotification("model.added", { modelName: "gpt" }).title).toBe(
      "Model added"
    );
    expect(renderNotification("profile.updated", {}).title).toBe("Profile updated");
  });

  it("renders grant / tool-approval / pending / policy events", () => {
    expect(
      renderNotification("grant.received", { capabilities: "read_files" }).body
    ).toContain("read_files");
    expect(renderNotification("grant.revoked", {}).title).toBe("Access revoked");
    expect(
      renderNotification("tool.approval_required", {
        agentName: "Bot",
        toolName: "shell",
      }).body
    ).toBe("Bot is waiting for approval to run shell.");
    expect(
      renderNotification("agent.pending", { agentName: "Bot" }).body
    ).toContain("needs approval");
    expect(
      renderNotification("policy.updated", { action: "created" }).body
    ).toContain("created");
  });
});
