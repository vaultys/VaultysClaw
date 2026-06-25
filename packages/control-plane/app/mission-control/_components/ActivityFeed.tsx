"use client";

import { timeAgo } from "@vaultysclaw/shared";
import {
  FEED_COLOR,
  FEED_ICON,
  type DetailItem,
  type FeedEvent,
} from "./types";
import { PanelHeader } from "./ui";

export function ActivityFeed({
  feed,
  wsConnected,
  onSelect,
}: {
  feed: FeedEvent[];
  wsConnected: boolean;
  onSelect: (item: DetailItem) => void;
}) {
  return (
    <div className="flex-col overflow-hidden bg-background-100 border border-neutral-200/60 rounded-xl shadow-md shadow-black/10 hidden lg:flex min-h-0">
      <PanelHeader
        title="Live Activity"
        right={
          <span
            className={`relative flex h-1.5 w-1.5 ${!wsConnected && "opacity-40"}`}
          >
            {wsConnected && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success-600 opacity-75" />
            )}
            <span
              className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                wsConnected ? "bg-success-600" : "bg-foreground-200/40"
              }`}
            />
          </span>
        }
      />

      <div className="flex-1 overflow-y-auto">
        {feed.length === 0 ? (
          <div className="px-3 py-6 text-center text-foreground-600 text-[11px]">
            Waiting for activity…
          </div>
        ) : (
          feed.map((event, i) => {
            const clickable = !!(event.entityId && event.entityType);
            return (
              <div
                key={event.id}
                className={`px-4 py-2.5 border-b border-neutral-200/50 flex gap-2 ${
                  i === 0 ? "bg-background-200/40 animate-fade-in" : ""
                } ${clickable ? "cursor-pointer hover:bg-background-200/30 transition-colors" : ""}`}
                style={{ opacity: Math.max(0.15, 1 - i * 0.013) }}
                onClick={
                  clickable
                    ? () =>
                        onSelect({
                          type: event.entityType!,
                          id: event.entityId!,
                        })
                    : undefined
                }
              >
                <span
                  className={`shrink-0 text-[11px] font-bold w-3 text-center ${FEED_COLOR[event.type]}`}
                >
                  {FEED_ICON[event.type]}
                </span>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-[11px] leading-snug break-words ${FEED_COLOR[event.type]}`}
                  >
                    {event.message}
                  </p>
                  {event.detail && (
                    <p className="text-[10px] text-foreground-600 mt-px">
                      {event.detail}
                    </p>
                  )}
                  <p className="text-[10px] text-foreground-700 mt-0.5">
                    {timeAgo(event.timestamp)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
