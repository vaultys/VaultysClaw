"use client";

import { useEffect, useState } from "react";
import { Bell, Mail, MonitorSmartphone } from "lucide-react";
import { userApi, unwrap } from "@/lib/api/ts-rest/client";
import type {
  NotificationPreferencesResponse,
  ChannelPrefs,
} from "@/lib/contracts";
import type { NotificationChannel, NotificationLevel } from "@vaultysclaw/shared";
import { SectionHeader } from "./primitives";

const LEVEL_LABELS: Record<NotificationLevel, string> = {
  user: "Personal",
  admin: "Administration",
  owner: "Owner",
};

const CHANNEL_META: {
  key: NotificationChannel;
  label: string;
  icon: React.ElementType;
}[] = [
  { key: "inApp", label: "In-app", icon: Bell },
  { key: "email", label: "Email", icon: Mail },
  { key: "push", label: "Push", icon: MonitorSmartphone },
];

export function NotificationsTab() {
  const [data, setData] = useState<NotificationPreferencesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pushPermission, setPushPermission] = useState<string>("default");

  useEffect(() => {
    userApi.notifications
      .getPreferences()
      .then((res) => setData(unwrap(res)))
      .catch(() => {})
      .finally(() => setLoading(false));
    if (typeof Notification !== "undefined") {
      setPushPermission(Notification.permission);
    }
  }, []);

  const toggle = async (
    eventType: string,
    channel: NotificationChannel,
    next: boolean
  ) => {
    if (!data) return;
    const current = data.preferences[eventType];
    const updated: ChannelPrefs = { ...current, [channel]: next };

    // Optimistic update
    setData({
      ...data,
      preferences: { ...data.preferences, [eventType]: updated },
    });

    try {
      unwrap(
        await userApi.notifications.updatePreference({
          body: { eventType, ...updated },
        })
      );
    } catch {
      // Revert on failure
      setData((d) =>
        d
          ? {
              ...d,
              preferences: { ...d.preferences, [eventType]: current },
            }
          : d
      );
    }
  };

  const requestPush = async () => {
    if (typeof Notification === "undefined") return;
    const perm = await Notification.requestPermission();
    setPushPermission(perm);
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-32 bg-background-200 rounded-xl" />
        <div className="h-32 bg-background-200 rounded-xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-danger-50 border border-danger-300 rounded-xl px-4 py-3 text-danger-600 text-sm">
        Failed to load notification preferences.
      </div>
    );
  }

  // Group events by level, preserving catalog order.
  const levels: NotificationLevel[] = [];
  for (const ev of data.events) {
    if (!levels.includes(ev.level)) levels.push(ev.level);
  }

  return (
    <div className="space-y-4">
      {pushPermission !== "granted" && (
        <section className="bg-background-100 border border-neutral-200 rounded-xl p-4 flex items-center justify-between gap-4">
          <div className="text-sm text-foreground-700">
            Enable browser notifications to receive push alerts on this device.
          </div>
          <button
            onClick={requestPush}
            className="shrink-0 px-3 py-1.5 rounded-lg text-sm bg-primary-600 text-white hover:bg-primary-700 transition-colors"
          >
            {pushPermission === "denied" ? "Blocked in browser" : "Enable push"}
          </button>
        </section>
      )}

      {levels.map((level) => {
        const events = data.events.filter((e) => e.level === level);
        return (
          <section
            key={level}
            className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden"
          >
            <SectionHeader icon={Bell} title={LEVEL_LABELS[level]} />
            <div className="divide-y divide-neutral-200/60">
              {/* Header row */}
              <div className="hidden sm:grid grid-cols-[1fr_auto] items-center px-5 py-2 text-[10px] uppercase tracking-wider text-foreground-400 font-medium">
                <span>Event</span>
                <div className="flex gap-6">
                  {CHANNEL_META.map((c) => (
                    <span key={c.key} className="w-12 text-center">
                      {c.label}
                    </span>
                  ))}
                </div>
              </div>

              {events.map((ev) => {
                const prefs = data.preferences[ev.type];
                return (
                  <div
                    key={ev.type}
                    className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">
                        {ev.label}
                      </div>
                      <div className="text-xs text-foreground-500">
                        {ev.description}
                      </div>
                    </div>
                    <div className="flex gap-6">
                      {CHANNEL_META.map((c) => (
                        <label
                          key={c.key}
                          className="w-12 flex items-center justify-center"
                          title={c.label}
                        >
                          <input
                            type="checkbox"
                            className="w-4 h-4 accent-primary-600 cursor-pointer"
                            checked={prefs?.[c.key] ?? false}
                            onChange={(e) =>
                              toggle(ev.type, c.key, e.target.checked)
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <p className="text-xs text-foreground-400 px-1">
        Uncheck every channel for an event to stop being notified about it.
      </p>
    </div>
  );
}
