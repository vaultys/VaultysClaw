import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import IORedis from "ioredis";
import { authOptions } from "@/lib/auth-config";
import { UserDAO } from "@/db";
import { userNotificationChannel } from "@vaultysclaw/shared";
import { withError } from "@/lib/api/handlers/with-error";
import { unauthorized, unavailable } from "@/lib/api/utils/api-utils";

/**
 * GET /api/notifications/stream
 * Server-Sent Events stream of the current user's live notifications.
 *
 * Subscribes to the per-user Redis pub/sub channel that the notifier service
 * publishes to. Each message is forwarded to the browser, which updates the bell
 * and (when `push` is set) raises a system Notification.
 *
 * Streaming response — stays on `withError` returning a raw `Response`.
 */
export const GET = withError(async (_request: NextRequest) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) return unauthorized();

  const userId =
    session.user.userId ?? (await UserDAO.findByDid(session.user.did))?.id;
  if (!userId) return unauthorized();

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return unavailable("Notifications transport not configured");

  const channel = userNotificationChannel(userId);
  const subscriber = new IORedis(redisUrl, { maxRetriesPerRequest: null });

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const safeWrite = (chunk: string) => {
    writer.write(encoder.encode(chunk)).catch(() => {});
  };

  // Initial comment so the connection opens immediately.
  safeWrite(": connected\n\n");

  subscriber.on("message", (_ch, payload) => {
    safeWrite(`data: ${payload}\n\n`);
  });
  subscriber.subscribe(channel).catch(() => {});

  // Heartbeat to keep proxies from closing the idle connection.
  const heartbeat = setInterval(() => safeWrite(": ping\n\n"), 25_000);

  const cleanup = () => {
    clearInterval(heartbeat);
    subscriber.quit().catch(() => {});
    writer.close().catch(() => {});
  };
  writer.closed.then(cleanup).catch(cleanup);

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
});
