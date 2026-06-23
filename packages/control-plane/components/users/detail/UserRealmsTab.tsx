"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Globe,
  Plus,
  X,
  ShieldCheck,
  Star,
} from "lucide-react";
import {
  usersClient,
  realmsClient,
  unwrap,
  ApiError,
} from "@/lib/api/ts-rest/client";
import type {
  UserDetail,
  UserRealmMembership,
  UserRealmsResponse,
} from "@/lib/contracts";

type AvailableRealm = UserRealmsResponse["available"][number];

export function UserRealmsTab({
  user,
  isOwner,
}: {
  user: UserDetail;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [memberships, setMemberships] = useState<UserRealmMembership[]>([]);
  const [available, setAvailable] = useState<AvailableRealm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingRealmId, setAddingRealmId] = useState("");
  const [addAsAdmin, setAddAsAdmin] = useState(false);
  const [addAsPrimary, setAddAsPrimary] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = unwrap(
        await usersClient.realms({ params: { did: user.did! } })
      );
      setMemberships(data.memberships);
      setAvailable(data.available);
    } catch {
      setError("Failed to load realms");
    } finally {
      setLoading(false);
    }
  }, [user.did]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    if (!addingRealmId) return;
    setAdding(true);
    setAddError(null);
    try {
      unwrap(
        await realmsClient.addUser({
          params: { id: addingRealmId },
          body: {
            userDid: user.did!,
            isPrimary: addAsPrimary,
            isRealmAdmin: addAsAdmin,
          },
        })
      );
      setAddingRealmId("");
      setAddAsAdmin(false);
      setAddAsPrimary(false);
      load();
    } catch (err) {
      setAddError(
        err instanceof ApiError ? err.message : "Failed to add to realm"
      );
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (realmId: string) => {
    setBusy(realmId + ":remove");
    try {
      unwrap(
        await realmsClient.removeUser({
          params: { id: realmId },
          body: { userDid: user.did! },
        })
      );
      load();
    } catch (err) {
      alert(
        err instanceof ApiError ? err.message : "Failed to remove from realm"
      );
    } finally {
      setBusy(null);
    }
  };

  const handleToggleAdmin = async (realmId: string, current: boolean) => {
    setBusy(realmId + ":admin");
    try {
      unwrap(
        await realmsClient.updateUser({
          params: { id: realmId },
          body: { userDid: user.did!, isRealmAdmin: !current },
        })
      );
      load();
    } catch (err) {
      alert(
        err instanceof ApiError
          ? err.message
          : "Failed to update realm admin status"
      );
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-foreground mb-0.5">
          Realm memberships
        </h2>
        <p className="text-xs text-foreground-500">
          Realms this user belongs to. Realm admins can manage agents and
          settings within their realm.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-danger-500 text-sm bg-danger-50 border border-danger-200 rounded-xl px-4 py-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {memberships.length === 0 ? (
        <div className="flex flex-col items-center py-10 text-foreground-500 gap-2">
          <Globe size={32} strokeWidth={1} />
          <p className="text-sm">Not a member of any realm yet.</p>
        </div>
      ) : (
        <div className="divide-y divide-neutral-200 border border-neutral-200 rounded-xl overflow-hidden">
          {memberships.map((m) => (
            <div
              key={m.realmId}
              className="flex items-center gap-3 px-4 py-3 bg-background-100 hover:bg-background-200 transition-colors"
            >
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: m.realmColor ?? "#6366f1" }}
              />
              <div className="flex-1 min-w-0">
                <button
                  onClick={() => router.push(`/realms/${m.realmId}`)}
                  className="text-sm font-medium text-foreground hover:text-primary-400 transition-colors truncate block"
                >
                  {m.realmName}
                </button>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {m.isDefault && (
                    <span className="text-xs text-foreground-400">Default</span>
                  )}
                  {m.isPrimary && (
                    <span className="flex items-center gap-1 text-xs text-warning-600">
                      <Star size={10} className="fill-current" /> Primary
                    </span>
                  )}
                  {m.isRealmAdmin && (
                    <span className="flex items-center gap-1 text-xs text-primary-600">
                      <ShieldCheck size={10} /> Realm admin
                    </span>
                  )}
                </div>
              </div>

              {isOwner && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleToggleAdmin(m.realmId, m.isRealmAdmin)}
                    disabled={busy === m.realmId + ":admin"}
                    title={
                      m.isRealmAdmin ? "Revoke realm admin" : "Make realm admin"
                    }
                    className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                      m.isRealmAdmin
                        ? "border-primary-300 text-primary-600 hover:border-neutral-300 hover:text-foreground-500"
                        : "border-neutral-300 text-foreground-500 hover:border-primary-300 hover:text-primary-600"
                    }`}
                  >
                    <ShieldCheck size={12} />
                    {m.isRealmAdmin ? "Admin" : "Set admin"}
                  </button>
                  {!m.isDefault && (
                    <button
                      onClick={() => handleRemove(m.realmId)}
                      disabled={busy === m.realmId + ":remove"}
                      title="Remove from realm"
                      className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-neutral-300 text-foreground-500 hover:border-danger-400 hover:text-danger-500 transition-colors disabled:opacity-50"
                    >
                      <X size={12} />
                      Remove
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {isOwner && available.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-foreground-500 uppercase tracking-wider mb-3">
            Add to realm
          </h3>
          <div className="bg-background-200 border border-neutral-200 rounded-xl p-4 space-y-3">
            <select
              value={addingRealmId}
              onChange={(e) => setAddingRealmId(e.target.value)}
              className="w-full bg-background-100 border border-neutral-300 text-foreground text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
            >
              <option value="">— Select a realm —</option>
              {available.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={addAsAdmin}
                  onChange={(e) => setAddAsAdmin(e.target.checked)}
                  className="rounded border-neutral-300"
                />
                Realm admin
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={addAsPrimary}
                  onChange={(e) => setAddAsPrimary(e.target.checked)}
                  className="rounded border-neutral-300"
                />
                Primary realm
              </label>
            </div>

            {addError && (
              <div className="flex items-center gap-2 text-danger-500 text-xs">
                <AlertCircle size={12} />
                {addError}
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleAdd}
                disabled={!addingRealmId || adding}
                className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium text-sm px-4 py-2 rounded-xl transition-colors"
              >
                <Plus size={14} />
                {adding ? "Adding…" : "Add to realm"}
              </button>
            </div>
          </div>
        </section>
      )}

      {isOwner && available.length === 0 && memberships.length > 0 && (
        <p className="text-xs text-foreground-400">
          This user is already a member of all realms.
        </p>
      )}
    </div>
  );
}
