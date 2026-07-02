"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Network, Pencil, Star, Trash2 } from "lucide-react";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import EmbeddedOrgChart from "@/components/graph/EmbeddedOrgChart";
import { useRole } from "@/hooks/useRole";
import { normalizeWorkspaceRole } from "@/lib/roles";
import { useWorkspaceDetail } from "@/hooks/useWorkspaceDetail";
import { WorkspaceTab } from "@/components/workspaces/types";
import { EditWorkspacePanel } from "@/components/workspaces/EditWorkspacePanel";
import { TokenMetricsCards } from "@/components/workspaces/TokenMetricsCards";
import { WorkspaceTabBar } from "@/components/workspaces/WorkspaceTabBar";
import { AgentsTab } from "@/components/workspaces/AgentsTab";
import { UsersTab } from "@/components/workspaces/UsersTab";
import { WorkflowsTab } from "@/components/workspaces/WorkflowsTab";
import { SkillsTab } from "@/components/workspaces/SkillsTab";
import { ModelsTab } from "@/components/workspaces/ModelsTab";
import { ChannelsTab } from "@/components/workspaces/ChannelsTab";
import { ConfigTab } from "@/components/workspaces/ConfigTab";
import { AddMemberModal } from "@/components/workspaces/AddMemberModal";
import { MapTab } from "@/components/workspaces/MapTab";

export default function WorkspaceDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { isGlobalAdmin, did } = useRole();

  const {
    workspace,
    loading,
    agents,
    users,
    workflows,
    tokenUsage,
    skills,
    workspaceModels,
    routerKey,
    litellmConfigured,
    channels,
    setChannels,
    mapMarkers,
    mapLoading,
    refreshMapMarkers,
    saveWorkspaceMarkerLocation,
    load,
    removeAgent,
    removeUser,
    setUserRole,
    transferOwner,
    setDefault,
    remove,
  } = useWorkspaceDetail(id);

  // Viewer's own role within this workspace, used to gate management actions.
  // Global-admin status grants visibility only — never management/ownership
  // powers inside a workspace; those come solely from the membership role.
  const myRole = normalizeWorkspaceRole(
    users.find((u) => u.user.did === did)?.role
  );
  // Workspace admins (and owners) manage the workspace contents.
  const canManage = myRole === "Owner" || myRole === "Admin";
  // Only the owner can edit/delete the workspace or transfer ownership.
  const canOwn = myRole === "Owner";

  const [tab, setTab] = useState<WorkspaceTab>("agents");
  const [addModal, setAddModal] = useState<"agent" | "user" | null>(null);
  const [editing, setEditing] = useState(false);

  useBreadcrumbs(
    [
      { label: "Workspaces", href: "/app/workspaces" },
      { label: workspace?.name ?? "Workspace" },
    ],
    [workspace?.name]
  );

  useToolbar(
    {
      title: workspace?.name ?? "Workspace",
      description: workspace ? (
        <span className="flex items-center gap-2 flex-wrap">
          <code className="font-mono text-foreground-400">
            {workspace.slug}
          </code>
          {workspace.description && (
            <span className="text-foreground-500">
              · {workspace.description}
            </span>
          )}
          <span className="text-foreground-400">
            · {agents.length} agent{agents.length !== 1 ? "s" : ""} ·{" "}
            {users.length} user{users.length !== 1 ? "s" : ""} ·{" "}
            {workflows.length} workflow{workflows.length !== 1 ? "s" : ""} ·{" "}
            {(tokenUsage?.promptTokens ?? 0).toLocaleString()} in /{" "}
            {(tokenUsage?.completionTokens ?? 0).toLocaleString()} out tokens
          </span>
        </span>
      ) : (
        "Loading…"
      ),
      actions: workspace
        ? [
            {
              kind: "button" as const,
              id: "graph",
              label: "Graph",
              icon: <Network className="w-3.5 h-3.5" />,
              onClick: () => router.push(`/app/workspaces/${id}/graph`),
            },
            // Editing workspace metadata/config is owner-only.
            ...(canOwn
              ? [
                  {
                    kind: "button" as const,
                    id: "edit",
                    label: "Edit",
                    icon: <Pencil className="w-3.5 h-3.5" />,
                    onClick: () => setEditing(true),
                  },
                ]
              : []),
            // Choosing the org default workspace is a global-admin concern.
            ...(isGlobalAdmin
              ? [
                  {
                    kind: "button" as const,
                    id: "default",
                    label: workspace.isDefault ? "Default" : "Set default",
                    icon: <Star className="w-3.5 h-3.5" />,
                    variant: (workspace.isDefault ? "success" : "default") as
                      | "success"
                      | "default",
                    disabled: workspace.isDefault,
                    onClick: setDefault,
                  },
                ]
              : []),
            // Deleting the workspace is owner-only.
            ...(canOwn
              ? [
                  {
                    kind: "button" as const,
                    id: "delete",
                    label: "Delete",
                    icon: <Trash2 className="w-3.5 h-3.5" />,
                    variant: "danger" as const,
                    disabled: workspace.isDefault,
                    onClick: remove,
                  },
                ]
              : []),
          ]
        : [],
    },
    [
      workspace,
      agents.length,
      users.length,
      workflows.length,
      tokenUsage,
      id,
      router,
      setDefault,
      remove,
      canOwn,
      isGlobalAdmin,
    ]
  );

  if (loading) {
    return (
      <div className="flex justify-center py-32">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!workspace) return null;

  return (
    <div className="p-6 w-full max-w-7xl mx-auto space-y-5">
      {editing && (
        <EditWorkspacePanel
          workspace={workspace}
          onClose={() => setEditing(false)}
          onSaved={load}
        />
      )}

      <TokenMetricsCards tokenUsage={tokenUsage} />

      <WorkspaceTabBar
        active={tab}
        counts={{
          agents: agents.length,
          users: users.length,
          workflows: workflows.length,
          skills: skills.length,
          models: workspaceModels.length,
          channels: channels.length,
        }}
        onSelect={(t) => {
          setTab(t);
          if (t === "map") refreshMapMarkers();
        }}
      />

      {tab === "agents" && (
        <AgentsTab
          agents={agents}
          canManage={canManage}
          canRemove={!workspace.isDefault}
          onAdd={() => setAddModal("agent")}
          onRemove={removeAgent}
        />
      )}
      {tab === "users" && (
        <UsersTab
          users={users}
          canRemove={!workspace.isDefault}
          canManage={canManage}
          canTransferOwner={canOwn}
          selfDid={did}
          onAdd={() => setAddModal("user")}
          onRemove={removeUser}
          onSetRole={setUserRole}
          onTransferOwner={transferOwner}
        />
      )}
      {tab === "workflows" && (
        <WorkflowsTab
          workspaceId={id}
          workflows={workflows}
          canManage={canManage}
        />
      )}
      {tab === "skills" && (
        <SkillsTab
          workspaceId={id}
          skills={skills}
          onChanged={load}
          canManage={canManage}
        />
      )}
      {tab === "models" && (
        <ModelsTab
          workspaceId={id}
          models={workspaceModels}
          routerKey={routerKey}
          litellmConfigured={litellmConfigured}
          onRefresh={load}
          canManage={canManage}
        />
      )}
      {tab === "channels" && (
        <ChannelsTab
          workspaceId={id}
          channels={channels}
          setChannels={setChannels}
          canManage={canManage}
        />
      )}
      {tab === "org-chart" && (
        <div className="space-y-3">
          <EmbeddedOrgChart
            query={`?workspace=${id}`}
            height={600}
            showFullscreenBtn={true}
          />
        </div>
      )}
      {tab === "map" && (
        <MapTab
          markers={mapMarkers}
          loading={mapLoading}
          canEdit={canManage}
          onSaveLocation={saveWorkspaceMarkerLocation}
        />
      )}
      {tab === "config" && (
        <ConfigTab workspace={workspace} onSaved={load} canEdit={canOwn} />
      )}

      {addModal && (
        <AddMemberModal
          workspace={workspace}
          type={addModal}
          onClose={() => setAddModal(null)}
          onAdded={load}
        />
      )}
    </div>
  );
}
