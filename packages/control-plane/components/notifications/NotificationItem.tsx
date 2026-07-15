"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NotificationDTO } from "@/lib/contracts";

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** A single notification row, shared by the bell dropdown and the full page. */
export function NotificationItem({
  n,
  onOpen,
  onDelete,
}: {
  n: NotificationDTO;
  onOpen: (n: NotificationDTO) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        "group relative flex gap-2.5 px-3 py-2.5 border-b border-neutral-200/60 last:border-0 hover:bg-background-200/60 transition-colors",
        !n.readAt && "bg-primary-50/50"
      )}
    >
      <span
        className={cn(
          "mt-1.5 w-2 h-2 rounded-full shrink-0",
          n.readAt ? "bg-transparent" : "bg-primary-500"
        )}
      />
      <button onClick={() => onOpen(n)} className="min-w-0 flex-1 text-left">
        <div className="text-sm font-medium text-foreground truncate pr-5">
          {n.title}
        </div>
        <div className="text-xs text-foreground-600">{n.body}</div>
        <div className="text-[10px] text-foreground-400 mt-0.5">
          {timeAgo(n.createdAt)}
        </div>
      </button>
      <button
        onClick={() => onDelete(n.id)}
        aria-label="Delete notification"
        className="absolute top-2 right-2 p-1 rounded text-foreground-400 opacity-0 group-hover:opacity-100 hover:text-danger-600 hover:bg-background-200 transition"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
