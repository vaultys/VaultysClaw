"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { Mail, UserX } from "lucide-react";
import { getInitials } from "@vaultysclaw/shared";

interface AdminContact {
  name: string | null;
  email: string | null;
}

/** Shown to a signed-in user who hasn't been added to any realm yet. */
export function NoRealmScreen() {
  const [admins, setAdmins] = useState<AdminContact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admins")
      .then((r) => (r.ok ? r.json() : { admins: [] }))
      .then((d: { admins?: AdminContact[] }) => setAdmins(d.admins ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] p-6">
      <div className="w-full max-w-3xl text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-warning-100 border border-warning-200 flex items-center justify-center">
            <UserX className="w-8 h-8 text-warning-600" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold text-foreground">
            You're not part of a workspace yet
          </h1>
          <p className="text-foreground-500 text-sm leading-relaxed">
            Your account exists but hasn't been assigned to any realm. An
            administrator needs to add you to a workspace before you can use
            VaultysClaw.
          </p>
        </div>

        <div className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden text-left">
          <div className="px-4 py-3 border-b border-neutral-200 bg-background-200/50">
            <p className="text-xs font-semibold text-foreground-500 uppercase tracking-widest">
              Contact an administrator
            </p>
          </div>

          {loading ? (
            <div className="px-4 py-6 flex justify-center">
              <div className="w-5 h-5 border-2 border-neutral-200 border-t-primary-500 rounded-full animate-spin" />
            </div>
          ) : admins.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-foreground-400">
                No administrators found. Please contact your IT team directly.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {admins.map((admin, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-full bg-primary-100 border border-primary-200 flex items-center justify-center shrink-0 text-primary-600 font-semibold text-sm">
                    {admin.name ? getInitials(admin.name) : "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {admin.name ?? "Administrator"}
                    </p>
                    {admin.email && (
                      <p className="text-xs text-foreground-400 truncate">
                        {admin.email}
                      </p>
                    )}
                  </div>
                  {admin.email && (
                    <a
                      href={`mailto:${admin.email}?subject=VaultysClaw%20workspace%20access`}
                      className="shrink-0 flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-500 border border-primary-200 hover:border-primary-400 px-2.5 py-1 rounded-lg transition-colors"
                    >
                      <Mail className="w-3 h-3" /> Email
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-xs text-foreground-400">
          Once an administrator adds you to a workspace, sign out and sign back
          in to pick up the new access.
        </p>

        <div className="flex flex-col items-center gap-2">
          <button
            onClick={() => signOut()}
            className="text-sm font-medium text-primary-600 hover:underline"
          >
            Sign out &amp; sign back in
          </button>
        </div>
      </div>
    </div>
  );
}
