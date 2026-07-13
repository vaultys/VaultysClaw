import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { APIException } from "@/lib/api/utils/api-utils";
import { NotificationDAO, UserDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { userContract } from "@/lib/contracts";
import type { NotificationDTO } from "@/lib/contracts";

/** Resolve the current user's internal id from the session. */
async function currentUserId(): Promise<string> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new APIException("UNAUTHORIZED");
  const id =
    session.user.userId ?? (await UserDAO.findByDid(session.user.did))?.id;
  if (!id) throw new APIException("UNAUTHORIZED");
  return id;
}

const handlers = createNextRoute(userContract.notifications, {
  list: async ({ query }) => {
    const userId = await currentUserId();
    const unreadOnly = query.unreadOnly === "true";
    const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 100);
    const offset = Math.max(Number(query.offset) || 0, 0);

    const rows = await NotificationDAO.listForUser(userId, {
      unreadOnly,
      limit,
      offset,
    });
    const unreadCount = await NotificationDAO.unreadCount(userId);
    const total = await NotificationDAO.countForUser(userId, { unreadOnly });
    const notifications: NotificationDTO[] = rows.map((n) => ({
      id: n.id,
      eventType: n.eventType,
      title: n.title,
      body: n.body,
      data: (n.data as Record<string, unknown> | null) ?? null,
      readAt: n.readAt ? n.readAt.toISOString() : null,
      createdAt: n.createdAt.toISOString(),
    }));
    return { status: 200, body: { notifications, unreadCount, total } };
  },

  clearAll: async () => {
    const userId = await currentUserId();
    await NotificationDAO.deleteAll(userId);
    return { status: 200, body: { ok: true } };
  },
});

export const GET = handlers.GET!;
export const DELETE = handlers.DELETE!;
