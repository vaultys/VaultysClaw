/**
 * Tests for the notification DAOs (packages/control-plane/db/notification.dao.ts)
 * against the test database:
 *   - create / listForUser / unreadCount
 *   - markRead / markAllRead
 *   - delete / deleteAll (the in-app delete feature)
 *   - NotificationPreferenceDAO upsert / getForUser / getRecipientsPrefs
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../packages/control-plane/db/client";
import {
  NotificationDAO,
  NotificationPreferenceDAO,
} from "../packages/control-plane/db";

const USER_ID = "did:test:notif-dao-user";

beforeAll(async () => {
  await prisma.user.upsert({
    where: { id: USER_ID },
    create: { id: USER_ID, role: "Member", name: "Notif DAO Test" },
    update: {},
  });
  // Clean slate for this user
  await prisma.notification.deleteMany({ where: { userId: USER_ID } });
  await prisma.notificationPreference.deleteMany({ where: { userId: USER_ID } });
});

afterAll(async () => {
  // Cascade removes notifications + preferences
  await prisma.user.deleteMany({ where: { id: USER_ID } });
});

describe("NotificationDAO", () => {
  it("create + listForUser + unreadCount", async () => {
    await NotificationDAO.create({
      userId: USER_ID,
      eventType: "workspace.member_added",
      title: "Added",
      body: "You were added to X.",
      data: { workspaceId: "ws-1" },
    });
    const rows = await NotificationDAO.listForUser(USER_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Added");
    expect(await NotificationDAO.unreadCount(USER_ID)).toBe(1);
  });

  it("markRead clears a single unread and unreadOnly filter works", async () => {
    const created = await NotificationDAO.create({
      userId: USER_ID,
      eventType: "user.joined",
      title: "New user",
      body: "Bob joined.",
    });
    expect(await NotificationDAO.unreadCount(USER_ID)).toBe(2);

    await NotificationDAO.markRead(created.id, USER_ID);
    expect(await NotificationDAO.unreadCount(USER_ID)).toBe(1);

    const unread = await NotificationDAO.listForUser(USER_ID, {
      unreadOnly: true,
    });
    expect(unread.every((n) => n.readAt === null)).toBe(true);
  });

  it("markRead does not affect another user's rows", async () => {
    const res = await NotificationDAO.markRead("nonexistent-id", USER_ID);
    expect(res.count).toBe(0);
  });

  it("markAllRead clears everything", async () => {
    await NotificationDAO.markAllRead(USER_ID);
    expect(await NotificationDAO.unreadCount(USER_ID)).toBe(0);
  });

  it("delete removes a single notification (scoped to the user)", async () => {
    const n = await NotificationDAO.create({
      userId: USER_ID,
      eventType: "workspace.member_removed",
      title: "Removed",
      body: "You were removed.",
    });
    const before = (await NotificationDAO.listForUser(USER_ID)).length;

    // Wrong user id must not delete
    const noop = await NotificationDAO.delete(n.id, "someone-else");
    expect(noop.count).toBe(0);

    const del = await NotificationDAO.delete(n.id, USER_ID);
    expect(del.count).toBe(1);
    expect((await NotificationDAO.listForUser(USER_ID)).length).toBe(before - 1);
  });

  it("deleteAll clears the user's notifications", async () => {
    await NotificationDAO.deleteAll(USER_ID);
    expect(await NotificationDAO.listForUser(USER_ID)).toHaveLength(0);
  });
});

describe("NotificationPreferenceDAO", () => {
  it("upsert creates then updates a preference", async () => {
    await NotificationPreferenceDAO.upsert(USER_ID, "user.joined", {
      inApp: true,
      email: true,
      push: false,
    });
    let all = await NotificationPreferenceDAO.getForUser(USER_ID);
    expect(all).toHaveLength(1);
    expect(all[0].email).toBe(true);

    await NotificationPreferenceDAO.upsert(USER_ID, "user.joined", {
      inApp: false,
      email: false,
      push: true,
    });
    all = await NotificationPreferenceDAO.getForUser(USER_ID);
    expect(all).toHaveLength(1); // still one row (unique userId+eventType)
    expect(all[0].push).toBe(true);
    expect(all[0].inApp).toBe(false);
  });

  it("getRecipientsPrefs filters by event type", async () => {
    const rows = await NotificationPreferenceDAO.getRecipientsPrefs(
      [USER_ID],
      "user.joined"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(USER_ID);

    const none = await NotificationPreferenceDAO.getRecipientsPrefs(
      [USER_ID],
      "workspace.member_added"
    );
    expect(none).toHaveLength(0);
  });
});
