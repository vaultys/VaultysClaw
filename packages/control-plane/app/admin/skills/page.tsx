"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Puzzle, Plus, AlertTriangle, BookOpen } from "lucide-react";
import { useRole } from "@/hooks/useRole";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import {
  adminApi,
  userApi,
  unwrap,
} from "@/lib/api/ts-rest/client";
import type { WorkspaceSkillWithMeta } from "@/lib/contracts";
import {
  AddSkillModal,
  BrowseLibraryModal,
  EditSkillModal,
  ShareToWorkspaceModal,
  SkillGroupCard,
  groupByName,
  type WorkspaceOption,
  type SkillGroup,
} from "@/components/skills";

export default function SkillsPage() {
  const router = useRouter();
  const { isGlobalAdmin, isLoading } = useRole();

  const [skills, setSkills] = useState<WorkspaceSkillWithMeta[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState<{
    open: boolean;
    prefillName: string;
    prefillDescription: string;
    prefillContent: string;
  }>({
    open: false,
    prefillName: "",
    prefillDescription: "",
    prefillContent: "",
  });
  const [showLibrary, setShowLibrary] = useState(false);
  const [shareGroup, setShareGroup] = useState<SkillGroup | null>(null);
  const [editEntry, setEditEntry] = useState<WorkspaceSkillWithMeta | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<WorkspaceSkillWithMeta | null>(
    null
  );
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!isLoading && !isGlobalAdmin) router.replace("/");
  }, [isLoading, isGlobalAdmin, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sk, rm] = await Promise.all([
        adminApi.skills.list(),
        userApi.workspaces.list(),
      ]);
      setSkills(unwrap(sk));
      setWorkspaces(unwrap(rm).workspaces.map((r) => ({ id: r.id, name: r.name })));
    } catch {
      // ignore — leave existing state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoading && isGlobalAdmin) load();
  }, [isLoading, isGlobalAdmin, load]);

  const openAdd = useCallback(
    () =>
      setAddModal({
        open: true,
        prefillName: "",
        prefillDescription: "",
        prefillContent: "",
      }),
    []
  );

  const closeAdd = useCallback(
    () =>
      setAddModal({
        open: false,
        prefillName: "",
        prefillDescription: "",
        prefillContent: "",
      }),
    []
  );

  const uniqueNames = new Set(skills.map((s) => s.name)).size;
  const sharedCount = Array.from(
    new Map(skills.map((s) => [s.name, 0])).keys()
  ).filter((name) => skills.filter((s) => s.name === name).length > 1).length;
  const workspacesWithSkills = new Set(skills.map((s) => s.workspaceId)).size;

  useBreadcrumbs([{ label: "Skills" }], []);

  useToolbar(
    {
      title: "Skills",
      description: loading
        ? "Manage skill registrations and workspace sharing"
        : `${skills.length} entr${skills.length !== 1 ? "ies" : "y"} · ${uniqueNames} unique · ${sharedCount} shared`,
      search: {
        value: search,
        onChange: setSearch,
        placeholder: "Search skills or workspaces…",
      },
      actions: [
        {
          kind: "button" as const,
          id: "catalog",
          label: "Org Catalog",
          variant: "default" as const,
          icon: <BookOpen className="w-3.5 h-3.5 text-primary-400" />,
          onClick: () => setShowLibrary(true),
        },
        {
          kind: "button" as const,
          id: "add",
          label: "Add Skill",
          variant: "primary" as const,
          icon: <Plus className="w-3.5 h-3.5" />,
          onClick: openAdd,
        },
      ],
    },
    [loading, skills.length, uniqueNames, sharedCount, search, openAdd]
  );

  async function handleDelete(entry: WorkspaceSkillWithMeta) {
    setDeleting(true);
    try {
      await userApi.workspaces.deleteSkill({
        params: { id: entry.workspaceId, skillId: entry.id },
      });
      await load();
    } finally {
      setDeleting(false);
      setDeleteEntry(null);
    }
  }

  if (isLoading || !isGlobalAdmin) return null;

  const filtered = search.trim()
    ? skills.filter(
        (s) =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.workspaceName.toLowerCase().includes(search.toLowerCase())
      )
    : skills;

  const groups = groupByName(filtered);

  return (
    <div className="p-6 w-full max-w-7xl mx-auto">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total entries", value: skills.length },
          { label: "Unique skills", value: uniqueNames },
          { label: "Workspaces with skills", value: workspacesWithSkills },
          { label: "Shared across workspaces", value: sharedCount },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="bg-background-100 border border-neutral-200 rounded-xl px-4 py-3"
          >
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <p className="text-xs text-foreground-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Skill groups */}
      {loading ? (
        <div className="flex justify-center py-16 text-foreground-500 text-sm">
          Loading…
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-16 text-foreground-500">
          <Puzzle className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">
            {search
              ? "No skills match your search"
              : "No skills registered yet"}
          </p>
          {!search && (
            <div className="mt-3 flex items-center justify-center gap-3">
              <button
                onClick={() => setShowLibrary(true)}
                className="text-sm text-primary-400 hover:text-primary-300 underline"
              >
                Browse library
              </button>
              <span className="text-foreground-500 text-xs">or</span>
              <button
                onClick={openAdd}
                className="text-sm text-primary-400 hover:text-primary-300 underline"
              >
                add manually
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <SkillGroupCard
              key={group.name}
              group={group}
              onEdit={setEditEntry}
              onDelete={setDeleteEntry}
              onAddToWorkspace={(g) => setShareGroup(g)}
            />
          ))}
        </div>
      )}

      {/* Library browser */}
      {showLibrary && (
        <BrowseLibraryModal
          onClose={() => setShowLibrary(false)}
          onSelect={(skill) => {
            // Close the catalog and open the pre-filled add modal in its place
            setShowLibrary(false);
            // Content is already in the catalog response — no extra fetch needed
            setAddModal({
              open: true,
              prefillName: skill.name,
              prefillDescription: skill.description,
              prefillContent: skill.content ?? "",
            });
          }}
        />
      )}

      {/* Share to workspace modal */}
      {shareGroup && (
        <ShareToWorkspaceModal
          group={shareGroup}
          workspaces={workspaces}
          onClose={() => setShareGroup(null)}
          onCreated={load}
        />
      )}

      {/* Add modal */}
      {addModal.open && workspaces.length > 0 && (
        <AddSkillModal
          workspaces={workspaces}
          prefillName={addModal.prefillName}
          prefillDescription={addModal.prefillDescription}
          prefillContent={addModal.prefillContent}
          onClose={closeAdd}
          onCreated={load}
        />
      )}
      {addModal.open && workspaces.length === 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-background-100 border border-neutral-200 rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <AlertTriangle className="w-8 h-8 text-warning-500 mx-auto mb-3" />
            <p className="text-sm text-foreground mb-4">
              No workspaces exist yet. Create a workspace before adding skills.
            </p>
            <button
              onClick={closeAdd}
              className="px-4 py-2 text-sm text-foreground-500 border border-neutral-200 rounded-lg hover:text-foreground transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editEntry && (
        <EditSkillModal
          entry={editEntry}
          onClose={() => setEditEntry(null)}
          onSaved={load}
        />
      )}

      {/* Delete confirm */}
      {deleteEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-background-100 border border-neutral-200 rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-danger-500 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Remove skill from workspace?
                </h3>
                <p className="text-xs text-foreground-500 mt-1">
                  <span className="font-mono font-medium text-foreground">
                    {deleteEntry.name}
                  </span>{" "}
                  will be removed from{" "}
                  <span className="font-medium text-foreground">
                    {deleteEntry.workspaceName}
                  </span>
                  . All agent overrides for this entry will be deleted and
                  agents will be notified.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteEntry(null)}
                className="px-4 py-2 text-sm text-foreground-500 border border-neutral-200 rounded-lg hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteEntry)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-white bg-danger-600 hover:bg-danger-500 rounded-lg disabled:opacity-50 transition-colors"
              >
                {deleting ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
