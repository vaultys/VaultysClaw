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
  remove: async ({ params }) => {
    const userId = await currentUserId();
    await NotificationDAO.delete(params.id, userId);
    return { status: 200, body: { ok: true } };
  },
});

export const DELETE = handlers.DELETE!;
