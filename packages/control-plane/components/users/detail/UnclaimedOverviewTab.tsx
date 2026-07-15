"use client";

import { useState } from "react";
import { Save, AlertCircle } from "lucide-react";
import { formatDateTime } from "@vaultysclaw/shared";
import {
  adminApi,
  unwrap,
  ApiError,
} from "@/lib/api/ts-rest/client";
import type { UnclaimedUserDetail } from "@/lib/contracts";

const ROLE_OPTIONS = [
  { value: "Member", label: "Member" },
  { value: "Admin", label: "Admin" },
] as const;

export function UnclaimedOverviewTab({
  user,
  isAdmin,
  onUpdated,
}: {
  user: UnclaimedUserDetail;
  isAdmin: boolean;
  onUpdated: (patch: Partial<UnclaimedUserDetail>) => void;
}) {
  const [name, setName] = useState(user.name ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [description, setDescription] = useState(user.description ?? "");
  const [role, setRole] = useState<string>(user.role ?? "Member");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const mark = () => {
    setDirty(true);
    setSaveError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      unwrap(
        await adminApi.users.updateUnclaimed({
          params: { id: user.id },
          body: {
            name,
            email,
            description,
            role: role as (typeof ROLE_OPTIONS)[number]["value"],
          },
        })
      );
      setDirty(false);
      onUpdated({
        name: name || null,
        email: email || null,
        description: description || null,
        role: role as (typeof ROLE_OPTIONS)[number]["value"],
      });
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
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
              disabled={!isAdmin}
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
              disabled={!isAdmin}
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
              disabled={!isAdmin}
              className="w-full bg-background-200 border border-neutral-300 text-foreground text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 placeholder:text-foreground-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed resize-y"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground-500 uppercase tracking-wider">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                mark();
              }}
              disabled={!isAdmin}
              className="w-full bg-background-200 border border-neutral-300 text-foreground text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {user.entraId && (
        <section>
          <h2 className="text-sm font-semibold text-foreground-500 uppercase tracking-wider mb-3">
            Entra Identity
          </h2>
          <div className="bg-background-200 rounded-lg border border-neutral-200 divide-y divide-neutral-200">
            <div className="flex items-start gap-4 px-4 py-3">
              <div className="w-28 flex-shrink-0 text-xs text-foreground-500 uppercase pt-0.5">
                Object ID
              </div>
              <div className="flex-1 text-xs font-mono text-foreground break-all">
                {user.entraId}
              </div>
            </div>
            <div className="flex items-start gap-4 px-4 py-3">
              <div className="w-28 flex-shrink-0 text-xs text-foreground-500 uppercase pt-0.5">
                Status
              </div>
              <div className="flex-1 text-sm text-warning-600">
                Waiting for account claim via QR code
              </div>
            </div>
            <div className="flex items-start gap-4 px-4 py-3">
              <div className="w-28 flex-shrink-0 text-xs text-foreground-500 uppercase pt-0.5">
                Provisioned
              </div>
              <div className="flex-1 text-sm text-foreground">
                {formatDateTime(user.registeredAt)}
              </div>
            </div>
          </div>
        </section>
      )}

      {saveError && (
        <div className="flex items-center gap-2 text-danger-500 text-sm bg-danger-50 border border-danger-200 rounded-xl px-4 py-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {saveError}
        </div>
      )}

      {isAdmin && (
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
