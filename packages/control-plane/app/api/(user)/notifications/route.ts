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
    const rows = await NotificationDAO.listForUser(userId, {
      unreadOnly: query.unreadOnly === "true",
    });
    const unreadCount = await NotificationDAO.unreadCount(userId);
    const notifications: NotificationDTO[] = rows.map((n) => ({
      id: n.id,
      eventType: n.eventType,
      title: n.title,
      body: n.body,
      data: (n.data as Record<string, unknown> | null) ?? null,
      readAt: n.readAt ? n.readAt.toISOString() : null,
      createdAt: n.createdAt.toISOString(),
    }));
    return { status: 200, body: { notifications, unreadCount } };
  },
});

export const GET = handlers.GET!;
