"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  AlertCircle,
  Shield,
  LayoutDashboard,
  KeyRound,
  GitBranch,
  Globe,
  Trash2,
  Clock,
} from "lucide-react";
import type { GraphNode } from "@vaultysclaw/shared";
import { shortDid, formatDate } from "@vaultysclaw/shared";
import { useToolbar, type ToolbarAction } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import { usersClient, unwrap, ApiError } from "@/lib/api/ts-rest/client";
import type { UserDetail } from "@/lib/contracts";
import UserGrantsPanel from "@/components/users/UserGrantsPanel";
import {
  UserTabBar,
  type UserTab,
  type UserTabId,
} from "@/components/users/detail/UserTabBar";
import { UserOverviewTab } from "@/components/users/detail/UserOverviewTab";
import { UserAccessTab } from "@/components/users/detail/UserAccessTab";
import { UserDetailsTab } from "@/components/users/detail/UserDetailsTab";
import { UserRealmsTab } from "@/components/users/detail/UserRealmsTab";

export default function UserEditPage() {
  const router = useRouter();
  const params = useParams<{ did: string }>();
  const did = decodeURIComponent(params.did);
  const { data: session } = useSession();

  const [activeTab, setActiveTab] = useState<UserTabId>("overview");
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [removing, setRemoving] = useState(false);

  const isOwner =
    (session?.user as { isOwner?: boolean } | undefined)?.isOwner ?? false;

  const load = useCallback(async () => {
    try {
      setUser(unwrap(await usersClient.getOne({ params: { did } })));
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        router.push("/");
        return;
      }
      if (err instanceof ApiError && err.status === 404) {
        setNotFound(true);
      }
    } finally {
      setLoading(false);
    }
  }, [did, router]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRemove = useCallback(async () => {
    if (!user || user.isOwner) return;
    if (
      !confirm(
        `Remove ${user.name ?? shortDid(user.did ?? undefined)} and all their grants? This cannot be undone.`
      )
    )
      return;
    setRemoving(true);
    try {
      unwrap(await usersClient.remove({ params: { did } }));
      router.push("/users");
    } catch {
      setRemoving(false);
    }
  }, [user, did, router]);

  useBreadcrumbs(
    [{ label: "Users", href: "/users" }, { label: user?.name ?? "User" }],
    [user?.name]
  );

  const toolbarActions: ToolbarAction[] = [];
  if (user) {
    toolbarActions.push({
      kind: "badge",
      id: "role",
      label: user.isOwner ? "Owner" : user.isAdmin ? "Admin" : user.role,
      tone: user.isOwner ? "warning" : user.isAdmin ? "success" : "neutral",
    });
    toolbarActions.push({
      kind: "badge",
      id: "registered",
      label: `Registered ${formatDate(user.registeredAt)}`,
      icon: <Clock size={11} />,
      tone: "neutral",
    });
    if (!user.isOwner && isOwner) {
      toolbarActions.push({
        kind: "button",
        id: "remove",
        label: "Remove",
        variant: "danger",
        icon: <Trash2 size={14} />,
        onClick: handleRemove,
        disabled: removing,
      });
    }
  }

  useToolbar(
    {
      title: user?.name ?? "Unnamed user",
      description: user ? (
        <span className="font-mono">{shortDid(user.did ?? undefined)}</span>
      ) : (
        did
      ),
      actions: toolbarActions,
    },
    [user, isOwner, removing, did, handleRemove]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-24">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !user) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex flex-col items-center py-16 text-center">
          <AlertCircle className="w-10 h-10 text-neutral-300 mb-3" />
          <p className="text-foreground font-medium">User not found</p>
          <p className="text-foreground-500 text-sm mt-1">
            This user may have been removed.
          </p>
        </div>
      </div>
    );
  }

  const tabs: UserTab[] = [
    { id: "overview", label: "Overview", icon: <LayoutDashboard size={15} /> },
    { id: "access", label: "Access", icon: <Shield size={15} /> },
    { id: "grants", label: "Grants", icon: <KeyRound size={15} /> },
    { id: "realms", label: "Realms", icon: <Globe size={15} /> },
    { id: "details", label: "Details", icon: <GitBranch size={15} /> },
  ];

  const patchUser = (patch: Partial<UserDetail>) =>
    setUser((u) => (u ? { ...u, ...patch } : u));

  return (
    <div className="p-6 w-full max-w-7xl mx-auto">
      <div className="border border-neutral-200 rounded-xl overflow-hidden bg-background-100">
        <UserTabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />

        <div className="p-6">
          {activeTab === "overview" && (
            <UserOverviewTab
              user={user}
              isOwner={isOwner}
              onUpdated={patchUser}
            />
          )}
          {activeTab === "access" && (
            <UserAccessTab user={user} isOwner={isOwner} onUpdated={patchUser} />
          )}
          {activeTab === "grants" && !user.isOwner && (
            <div>
              <div className="mb-4">
                <h2 className="text-base font-semibold text-foreground">
                  Agent Grants
                </h2>
                <p className="text-xs text-foreground-500 mt-0.5">
                  Capabilities this user can delegate to agents.
                </p>
              </div>
              <UserGrantsPanel userDid={user.did!} />
            </div>
          )}
          {activeTab === "grants" && user.isOwner && (
            <div className="flex flex-col items-center py-12 text-foreground-500 gap-2">
              <KeyRound size={36} strokeWidth={1} />
              <p className="text-sm">
                The owner has access to all capabilities.
              </p>
            </div>
          )}
          {activeTab === "realms" && (
            <UserRealmsTab user={user} isOwner={isOwner} />
          )}
          {activeTab === "details" && (
            <UserDetailsTab
              user={user}
              onNodeClick={(node: GraphNode) => {
                if (node.type === "agent")
                  router.push(
                    `/agents/${encodeURIComponent(node.id.replace("agent:", ""))}`
                  );
                else if (node.type === "realm")
                  router.push(`/realms/${node.id.replace("realm:", "")}`);
                else if (node.type === "user") {
                  const uid = node.id.replace("user:", "");
                  if (uid !== user.did)
                    router.push(`/users/${encodeURIComponent(uid)}`);
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
