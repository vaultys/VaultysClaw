"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/hooks/useNotifications";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Link a notification to a target page based on its payload, if any. */
function notificationHref(data: Record<string, unknown> | null): string | null {
  if (!data) return null;
  if (typeof data.workspaceId === "string") return `/workspaces/${data.workspaceId}`;
  return null;
}

export function NotificationBell() {
  const router = useRouter();
  const { notifications, unreadCount, markRead, markAllRead } =
    useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className={cn(
          "relative flex items-center justify-center w-9 h-9 rounded-lg transition-colors",
          open
            ? "bg-background-200 text-foreground"
            : "text-foreground-700 hover:text-foreground hover:bg-background-200/60"
        )}
      >
        <Bell className="w-[18px] h-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-danger-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-80 bg-background-100 border border-neutral-300 rounded-xl shadow-2xl shadow-black/40 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-neutral-200">
            <span className="text-sm font-semibold text-foreground">
              Notifications
            </span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead()}
                className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
              >
                <Check className="w-3 h-3" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-foreground-500">
                No notifications yet.
              </div>
            ) : (
              notifications.map((n) => {
                const href = notificationHref(n.data);
                return (
                  <button
                    key={n.id}
                    onClick={() => {
                      if (!n.readAt) markRead(n.id);
                      if (href) {
                        router.push(href);
                        setOpen(false);
                      }
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2.5 border-b border-neutral-200/60 last:border-0 hover:bg-background-200/60 transition-colors flex gap-2.5",
                      !n.readAt && "bg-primary-50/50"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1.5 w-2 h-2 rounded-full shrink-0",
                        n.readAt ? "bg-transparent" : "bg-primary-500"
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground truncate">
                        {n.title}
                      </div>
                      <div className="text-xs text-foreground-600">{n.body}</div>
                      <div className="text-[10px] text-foreground-400 mt-0.5">
                        {timeAgo(n.createdAt)}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
