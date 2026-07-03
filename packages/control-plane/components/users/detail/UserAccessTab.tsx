"use client";

import { useState } from "react";
import { Shield, ShieldOff, AlertCircle } from "lucide-react";
import {
  adminApi,
  unwrap,
  ApiError,
} from "@/lib/api/ts-rest/client";
import type { UserDetail } from "@/lib/contracts";

export function UserAccessTab({
  user,
  isOwner,
  onUpdated,
}: {
  user: UserDetail;
  isOwner: boolean;
  onUpdated: (patch: Partial<UserDetail>) => void;
}) {
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  const handleAdminToggle = async (makeAdmin: boolean) => {
    setAdminLoading(true);
    setAdminError(null);
    try {
      unwrap(
        await adminApi.users.setAdmin({
          params: { did: user.did! },
          body: { isAdmin: makeAdmin },
        })
      );
      onUpdated({ role: makeAdmin ? "Admin" : "Member" });
    } catch (err) {
      setAdminError(
        err instanceof ApiError ? err.message : "Failed to update admin status"
      );
    } finally {
      setAdminLoading(false);
    }
  };

  if (user.role === "Owner") {
    return (
      <div className="flex flex-col items-center py-12 text-foreground-500 gap-2">
        <Shield size={36} strokeWidth={1} />
        <p className="text-sm">
          The owner has full control-plane access by default.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-foreground mb-0.5">
          Control-plane access
        </h2>
        <p className="text-xs text-foreground-500">
          Admins can log into the control plane and manage agents, users, and
          grants.
        </p>
      </div>

      {adminError && (
        <div className="flex items-center gap-2 text-danger-500 text-sm bg-danger-50 border border-danger-200 rounded-xl px-4 py-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {adminError}
        </div>
      )}

      <div className="bg-background-200 rounded-lg border border-neutral-200 px-5 py-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-foreground">Admin role</p>
          <p className="text-xs text-foreground-500 mt-0.5">
            {user.role === "Admin"
              ? "This user can access the control plane."
              : "This user has no control-plane access."}
          </p>
        </div>
        {isOwner &&
          (user.role === "Admin" ? (
            <button
              onClick={() => handleAdminToggle(false)}
              disabled={adminLoading}
              className="flex items-center gap-2 bg-background-200 border border-neutral-300 hover:border-danger-400 text-foreground hover:text-danger-500 disabled:opacity-50 text-sm font-medium px-4 py-2 rounded-xl transition-colors"
            >
              <ShieldOff className="w-4 h-4" />
              {adminLoading ? "Updating…" : "Revoke admin"}
            </button>
          ) : (
            <button
              onClick={() => handleAdminToggle(true)}
              disabled={adminLoading}
              className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
            >
              <Shield className="w-4 h-4" />
              {adminLoading ? "Updating…" : "Make admin"}
            </button>
          ))}
      </div>
    </div>
  );
}
