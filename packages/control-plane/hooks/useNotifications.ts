"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { userApi, unwrap } from "@/lib/api/ts-rest/client";
import type { NotificationDTO } from "@/lib/contracts";
import {
  notificationAction,
  type NotificationStreamMessage,
} from "@vaultysclaw/shared";

/**
 * Loads the current user's notifications and keeps them live via the SSE stream
 * (`/api/notifications/stream`). New push-flagged messages raise a system
 * Notification when the user has granted permission; clicking it focuses the tab
 * and navigates to the notification's target page.
 */
export function useNotifications() {
  const router = useRouter();
  const { status } = useSession();
  const [notifications, setNotifications] = useState<NotificationDTO[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const esRef = useRef<EventSource | null>(null);

  // Initial load — the bell only shows the 10 most recent; the full history
  // lives on the dedicated notifications page.
  useEffect(() => {
    if (status !== "authenticated") return;
    userApi.notifications
      .list({ query: { limit: "10" } })
      .then((res) => {
        const data = unwrap(res);
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
        setTotal(data.total);
      })
      .catch(() => {});
  }, [status]);

  const markRead = useCallback(async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id && !n.readAt
          ? { ...n, readAt: new Date().toISOString() }
          : n
      )
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      unwrap(await userApi.notifications.markRead({ body: { id } }));
    } catch {
      /* best-effort */
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) =>
      prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() }))
    );
    setUnreadCount(0);
    try {
      unwrap(await userApi.notifications.markRead({ body: { all: true } }));
    } catch {
      /* best-effort */
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    setNotifications((prev) => {
      const target = prev.find((n) => n.id === id);
      if (target && !target.readAt) setUnreadCount((c) => Math.max(0, c - 1));
      return prev.filter((n) => n.id !== id);
    });
    setTotal((t) => Math.max(0, t - 1));
    try {
      unwrap(await userApi.notifications.remove({ params: { id } }));
    } catch {
      /* best-effort */
    }
  }, []);

  const clearAll = useCallback(async () => {
    setNotifications([]);
    setUnreadCount(0);
    setTotal(0);
    try {
      unwrap(await userApi.notifications.clearAll({}));
    } catch {
      /* best-effort */
    }
  }, []);

  // Live stream
  useEffect(() => {
    if (status !== "authenticated") return;
    const es = new EventSource("/api/notifications/stream");
    esRef.current = es;

    es.onmessage = (evt) => {
      let msg: NotificationStreamMessage;
      try {
        msg = JSON.parse(evt.data);
      } catch {
        return;
      }

      // Add to the in-app list only when it was persisted (has an id).
      if (msg.id) {
        const entry: NotificationDTO = {
          id: msg.id,
          eventType: msg.eventType,
          title: msg.title,
          body: msg.body,
          data: msg.data ?? null,
          readAt: null,
          createdAt: msg.createdAt,
        };
        setNotifications((prev) => [entry, ...prev].slice(0, 10));
        setUnreadCount((c) => c + 1);
        setTotal((t) => t + 1);
      }

      // Raise a system notification when requested and permitted. Clicking it
      // focuses the tab, navigates to the target page and marks it read.
      if (
        msg.push &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        try {
          const sysNotif = new Notification(msg.title, { body: msg.body });
          const target = notificationAction(msg.eventType, msg.data ?? {});
          sysNotif.onclick = () => {
            window.focus();
            if (target) router.push(target.path);
            if (msg.id) markRead(msg.id);
            sysNotif.close();
          };
        } catch {
          /* ignore */
        }
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects; nothing to do.
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [status, router, markRead]);

  return {
    notifications,
    unreadCount,
    total,
    markRead,
    markAllRead,
    remove,
    clearAll,
  };
}
