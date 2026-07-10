import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { APIException } from "@/lib/api/utils/api-utils";
import { NotificationDAO, UserDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { userContract } from "@/lib/contracts";

async function currentUserId(): Promise<string> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new APIException("UNAUTHORIZED");
  const id =
    session.user.userId ?? (await UserDAO.findByDid(session.user.did))?.id;
  if (!id) throw new APIException("UNAUTHORIZED");
  return id;
}

const handlers = createNextRoute(userContract.notifications, {
  markRead: async ({ body }) => {
    const userId = await currentUserId();
    if (body.all) {
      await NotificationDAO.markAllRead(userId);
    } else if (body.id) {
      await NotificationDAO.markRead(body.id, userId);
    } else {
      throw new APIException("MALFORMED", "Provide `id` or `all: true`");
    }
    return { status: 200, body: { ok: true } };
  },
});

export const POST = handlers.POST!;
