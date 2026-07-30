"use client";

import { shortDid, timeAgo } from "@vaultysclaw/shared";
import type { SensorDeviceInfo } from "@/lib/contracts";
import type { UserListItem } from "@/lib/contracts";

export function SensorsTable({
  sensors,
  users,
  assigningDid,
  onAssign,
  onRowClick,
}: {
  sensors: SensorDeviceInfo[];
  users: UserListItem[];
  assigningDid: string | null;
  onAssign: (did: string, userId: string | null) => void;
  onRowClick: (sensor: SensorDeviceInfo) => void;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-neutral-200 text-left text-xs font-medium text-foreground-400 uppercase tracking-wider">
          <th className="px-5 py-3">Device</th>
          <th className="px-5 py-3">Assigned user</th>
          <th className="px-5 py-3">Workspace</th>
          <th className="px-5 py-3">Workloads</th>
          <th className="px-5 py-3">Status</th>
          <th className="px-5 py-3">Last seen</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-200">
        {sensors.map((s) => (
          <tr
            key={s.did}
            className="hover:bg-background-200/40 transition-colors"
          >
            <td
              className="px-5 py-3.5 cursor-pointer"
              onClick={() => onRowClick(s)}
            >
              <div className="font-medium text-foreground">
                {s.name || s.hostname || (
                  <span className="text-foreground-400 italic font-normal">
                    Unnamed device
                  </span>
                )}
              </div>
              <div
                className="text-xs text-foreground-400 font-mono"
                title={s.did}
              >
                {shortDid(s.did)}
              </div>
              {s.os && (
                <div className="text-xs text-foreground-400">{s.os}</div>
              )}
            </td>
            <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
              <select
                value={s.assignedUserId ?? ""}
                disabled={assigningDid === s.did}
                onChange={(e) => onAssign(s.did, e.target.value || null)}
                className="px-2 py-1 bg-background-100 text-foreground border border-neutral-200 rounded-md text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:opacity-50"
              >
                <option value="">— Unassigned —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name ?? u.email ?? u.id}
                  </option>
                ))}
              </select>
            </td>
            <td className="px-5 py-3.5 text-foreground-500 text-xs">
              {s.workspace ? (
                s.workspace.name
              ) : (
                <span className="text-foreground-400">—</span>
              )}
            </td>
            <td
              className="px-5 py-3.5 text-foreground-500 text-xs cursor-pointer"
              onClick={() => onRowClick(s)}
            >
              {s._count.workloads}
            </td>
            <td className="px-5 py-3.5">
              {s.online ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-success-100 text-success-700 border border-success-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-success-500 inline-block" />
                  Online
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-background-200 text-foreground-400 border border-neutral-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 inline-block" />
                  Offline
                </span>
              )}
            </td>
            <td className="px-5 py-3.5 text-foreground-500 text-xs">
              {timeAgo(s.lastSeen)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
