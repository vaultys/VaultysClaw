"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { userApi, unwrap } from "@/lib/api/ts-rest/client";
import type { NotificationDTO } from "@/lib/contracts";
import { notificationAction } from "@vaultysclaw/shared";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";

const PAGE_SIZE = 20;

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const data = unwrap(
        await userApi.notifications.list({
          query: { limit: String(PAGE_SIZE), offset: String(p * PAGE_SIZE) },
        })
      );
      setItems(data.notifications);
      setTotal(data.total);
      setUnreadCount(data.unreadCount);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(page);
  }, [page, load]);

  const openNotification = (n: NotificationDTO) => {
    if (!n.readAt) {
      setItems((prev) =>
        prev.map((x) =>
          x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x
        )
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      userApi.notifications.markRead({ body: { id: n.id } }).catch(() => {});
    }
    const href = notificationAction(n.eventType, n.data ?? {})?.path;
    if (href) router.push(href);
  };

  const remove = (id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
    setTotal((t) => Math.max(0, t - 1));
    userApi.notifications
      .remove({ params: { id } })
      .catch(() => {})
      .finally(() => load(page));
  };

  const markAllRead = () => {
    setItems((prev) =>
      prev.map((x) => (x.readAt ? x : { ...x, readAt: new Date().toISOString() }))
    );
    setUnreadCount(0);
    userApi.notifications.markRead({ body: { all: true } }).catch(() => {});
  };

  const clearAll = () => {
    userApi.notifications
      .clearAll({})
      .catch(() => {})
      .finally(() => {
        setPage(0);
        load(0);
      });
  };

  useBreadcrumbs([{ label: "Notifications" }], []);
  useToolbar(
    {
      title: "Notifications",
      description:
        total > 0
          ? `${total} total · ${unreadCount} unread`
          : "You're all caught up",
      actions: [
        {
          kind: "button",
          id: "mark-all",
          label: "Mark all read",
          onClick: markAllRead,
        },
        {
          kind: "button",
          id: "clear-all",
          label: "Clear all",
          onClick: clearAll,
        },
      ],
    },
    [total, unreadCount]
  );

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6 w-full max-w-3xl mx-auto">
      <div className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 bg-background-200 rounded-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm text-foreground-500">
            No notifications.
          </div>
        ) : (
          items.map((n) => (
            <NotificationItem
              key={n.id}
              n={n}
              onOpen={openNotification}
              onDelete={remove}
            />
          ))
        )}
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-neutral-300 disabled:opacity-40 hover:bg-background-200/60 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>
          <span className="text-foreground-500">
            Page {page + 1} of {pageCount}
          </span>
          <button
            onClick={() => setPage((p) => (p + 1 < pageCount ? p + 1 : p))}
            disabled={page + 1 >= pageCount}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-neutral-300 disabled:opacity-40 hover:bg-background-200/60 transition-colors"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
