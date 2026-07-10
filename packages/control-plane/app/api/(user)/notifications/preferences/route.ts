import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { APIException } from "@/lib/api/utils/api-utils";
import { NotificationPreferenceDAO, UserDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { userContract } from "@/lib/contracts";
import type { ChannelPrefs } from "@/lib/contracts";
import { normalizeRole } from "@/lib/roles";
import { eventsForRole, getNotificationEvent } from "@vaultysclaw/shared";

async function currentUser(): Promise<{ id: string; role: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new APIException("UNAUTHORIZED");
  const id =
    session.user.userId ?? (await UserDAO.findByDid(session.user.did))?.id;
  if (!id) throw new APIException("UNAUTHORIZED");
  return { id, role: normalizeRole(session.user.role) };
}

const handlers = createNextRoute(userContract.notifications, {
  getPreferences: async () => {
    const { id, role } = await currentUser();
    const events = eventsForRole(role);
    const stored = await NotificationPreferenceDAO.getForUser(id);
    const storedByType = new Map(stored.map((p) => [p.eventType, p]));

    const preferences: Record<string, ChannelPrefs> = {};
    for (const ev of events) {
      const explicit = storedByType.get(ev.type);
      preferences[ev.type] = explicit
        ? { inApp: explicit.inApp, email: explicit.email, push: explicit.push }
        : {
            inApp: ev.defaultChannels.includes("inApp"),
            email: ev.defaultChannels.includes("email"),
            push: ev.defaultChannels.includes("push"),
          };
    }

    return { status: 200, body: { role, events, preferences } };
  },

  updatePreference: async ({ body }) => {
    const { id, role } = await currentUser();

    // A user may only configure events allowed for their role.
    const def = getNotificationEvent(body.eventType);
    const allowed = eventsForRole(role).some((e) => e.type === body.eventType);
    if (!def || !allowed) throw new APIException("FORBIDDEN");

    await NotificationPreferenceDAO.upsert(id, body.eventType, {
      inApp: body.inApp,
      email: body.email,
      push: body.push,
    });
    return { status: 200, body: { ok: true } };
  },
});

export const GET = handlers.GET!;
export const PUT = handlers.PUT!;
