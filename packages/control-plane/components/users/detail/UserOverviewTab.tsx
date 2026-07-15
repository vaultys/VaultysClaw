"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { Save, AlertCircle, MapPin } from "lucide-react";
import { shortDid } from "@vaultysclaw/shared";
import {
  adminApi,
  userApi,
  unwrap,
  ApiError,
} from "@/lib/api/ts-rest/client";
import type { UserDetail, UserListItem } from "@/lib/contracts";

const LocationEditor = dynamic(
  () => import("@/components/map/WorldMap").then((m) => m.LocationEditor),
  { ssr: false }
);

const ROLE_OPTIONS = [
  { value: "Member", label: "Member" },
  { value: "Admin", label: "Admin" },
  { value: "Owner", label: "Owner" },
] as const;

export function UserOverviewTab({
  user,
  isOwner,
  onUpdated,
}: {
  user: UserDetail;
  isOwner: boolean;
  onUpdated: (patch: Partial<UserDetail>) => void;
}) {
  const [name, setName] = useState(user.name ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [description, setDescription] = useState(user.description ?? "");
  const [role, setRole] = useState<string>(user.role ?? "Member");
  const [reportsTo, setReportsTo] = useState<string>(user.reportsTo ?? "");

  const [locationEditing, setLocationEditing] = useState(false);
  const [location, setLocation] = useState<{
    lat: number;
    lon: number;
    label: string;
  } | null>(
    user.locationLat != null && user.locationLon != null
      ? {
          lat: user.locationLat,
          lon: user.locationLon,
          label: user.locationLabel ?? "",
        }
      : null
  );

  const handleSaveLocation = useCallback(
    async (loc: { lat: number; lon: number; label: string } | null) => {
      const body =
        loc === null
          ? { lat: null }
          : { lat: loc.lat, lon: loc.lon, label: loc.label };
      unwrap(
        await adminApi.users.setLocation({ params: { did: user.did! }, body })
      );
      setLocation(loc);
    },
    [user.did]
  );

  const [allUsers, setAllUsers] = useState<UserListItem[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const mark = () => {
    setDirty(true);
    setSaveError(null);
  };

  useEffect(() => {
    adminApi.users
      .list({ query: { hasAccount: "true", pageSize: 1000 } })
      .then((res) => setAllUsers(unwrap(res).users))
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      unwrap(
        await adminApi.users.update({
          params: { did: user.did! },
          body: {
            name,
            email,
            description,
            role: role as (typeof ROLE_OPTIONS)[number]["value"],
            reportsTo: reportsTo || null,
          },
        })
      );
      setDirty(false);
      onUpdated({
        name: name || null,
        email: email || null,
        description: description || null,
        role: role as (typeof ROLE_OPTIONS)[number]["value"],
        reportsTo: reportsTo || null,
      });
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const supervisorOptions = allUsers.filter(
    (u) => u.did && u.did !== user.did
  );
  const currentSupervisor = supervisorOptions.find((u) => u.did === reportsTo);

  return (
    <div className="space-y-6">
      {/* Profile */}
      <section>
        <h2 className="text-sm font-semibold text-foreground-500 uppercase tracking-wider mb-3">
          Profile
        </h2>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground-500 uppercase tracking-wider">
              Display name
            </label>
            <input
              type="text"
              placeholder="e.g. Alice Martin"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                mark();
              }}
              disabled={!isOwner}
              className="w-full bg-background-200 border border-neutral-300 text-foreground text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 placeholder:text-foreground-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground-500 uppercase tracking-wider">
              Email address
            </label>
            <input
              type="email"
              placeholder="e.g. alice@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                mark();
              }}
              disabled={!isOwner}
              className="w-full bg-background-200 border border-neutral-300 text-foreground text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 placeholder:text-foreground-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground-500 uppercase tracking-wider">
              Description
            </label>
            <textarea
              rows={3}
              placeholder="Short description of this user's responsibilities…"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                mark();
              }}
              disabled={!isOwner}
              className="w-full bg-background-200 border border-neutral-300 text-foreground text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 placeholder:text-foreground-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed resize-y"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground-500 uppercase tracking-wider">
              Decentralized Identity (DID)
            </label>
            <div className="w-full bg-background-200 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm font-mono text-foreground-500 break-all select-all">
              {user.did}
            </div>
          </div>
        </div>
      </section>

      {/* Role & Hierarchy */}
      <section>
        <h2 className="text-sm font-semibold text-foreground-500 uppercase tracking-wider mb-3">
          Role & Hierarchy
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground-500 uppercase tracking-wider">
              Role
            </label>
            {user.role === "Owner" ? (
              <div className="w-full bg-background-200 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-foreground-500">
                Owner (cannot be changed)
              </div>
            ) : (
              <select
                value={role}
                onChange={(e) => {
                  setRole(e.target.value);
                  mark();
                }}
                disabled={!isOwner}
                className="w-full bg-background-200 border border-neutral-300 text-foreground text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground-500 uppercase tracking-wider">
              Supervisor
            </label>
            {!isOwner ? (
              <div className="w-full bg-background-200 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-foreground-500">
                {currentSupervisor ? (
                  (currentSupervisor.name ?? shortDid(currentSupervisor.did ?? undefined))
                ) : (
                  <span className="italic">None</span>
                )}
              </div>
            ) : (
              <select
                value={reportsTo}
                onChange={(e) => {
                  setReportsTo(e.target.value);
                  mark();
                }}
                className="w-full bg-background-200 border border-neutral-300 text-foreground text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
              >
                <option value="">— No supervisor —</option>
                {supervisorOptions.map((u) => (
                  <option key={u.did} value={u.did ?? ""}>
                    {u.name ?? shortDid(u.did ?? undefined)}
                    {u.role === "Owner" ? " (Owner)" : ""}
                  </option>
                ))}
              </select>
            )}
            <p className="text-xs text-foreground-400 mt-1">
              Defines the reporting line shown in the relationship graph.
            </p>
          </div>
        </div>
      </section>

      {saveError && (
        <div className="flex items-center gap-2 text-danger-500 text-sm bg-danger-50 border border-danger-200 rounded-xl px-4 py-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {saveError}
        </div>
      )}

      {/* Location */}
      <section>
        <h2 className="text-sm font-semibold text-foreground-500 uppercase tracking-wider mb-3">
          Location
        </h2>
        <div className="bg-background-200 border border-neutral-200 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <MapPin size={14} className="text-foreground-400 shrink-0" />
            {location ? (
              <span className="text-sm text-foreground truncate">
                {location.label || "Custom location"}{" "}
                <span className="text-foreground-400 font-mono text-xs">
                  ({location.lat.toFixed(4)}, {location.lon.toFixed(4)})
                </span>
              </span>
            ) : (
              <span className="text-sm text-foreground-400">
                No location set
              </span>
            )}
          </div>
          <button
            onClick={() => setLocationEditing(true)}
            className="text-xs text-primary-500 hover:text-primary-400 shrink-0 transition-colors"
          >
            {location ? "Edit" : "Set location"}
          </button>
        </div>
        {locationEditing && (
          <LocationEditor
            current={location}
            onSave={handleSaveLocation}
            onClose={() => setLocationEditing(false)}
          />
        )}
      </section>

      {isOwner && (
        <div className="flex justify-end pt-1">
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium text-sm px-5 py-2.5 rounded-xl transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}
    </div>
  );
}
