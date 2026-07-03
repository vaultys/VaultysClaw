"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Loader2,
  Plus,
  BookOpen,
  WifiOff,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  FileType2,
} from "lucide-react";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import {
  adminApi,
  unwrap,
} from "@/lib/api/ts-rest/client";
import { KsSourceCard } from "./knowledge/KsSourceCard";
import { KsAddSourceModal } from "./knowledge/KsAddSourceModal";
import type { KsWorkspaceOption } from "./knowledge/types";
import { KnowledgeSource } from "@prisma/client";

export function KnowledgeTab({
  did,
  online,
  capabilities,
}: {
  did: string;
  agentName: string;
  online: boolean;
  capabilities: string[];
}) {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [workspaces, setWorkspaces] = useState<KsWorkspaceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [doclingConfigured, setDoclingConfigured] = useState(false);
  const [granting, setGranting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeSource | null>(
    null
  );

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ksRes, rlRes] = await Promise.all([
        adminApi.knowledge.list({ query: { agentDid: did } }),
        fetch("/api/workspaces"),
      ]);
      const rlData = (await rlRes.json()) as { workspaces?: KsWorkspaceOption[] };
      setSources(unwrap(ksRes).sources);
      setWorkspaces(rlData.workspaces ?? []);
    } finally {
      setLoading(false);
    }
  }, [did]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    adminApi.settings
      .getDocling()
      .then((res) => {
        const d = unwrap(res);
        setDoclingConfigured(d.configured === true || Boolean(d.url));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!sources.some((s) => s.status === "syncing")) return;
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [sources, load]);

  async function handleSync(source: KnowledgeSource) {
    if (!online) {
      showToast("Agent is offline — cannot sync", false);
      return;
    }
    setSyncingIds((s) => new Set(s).add(source.id));
    try {
      unwrap(await adminApi.knowledge.sync({ params: { id: source.id } }));
      showToast(`Sync started for "${source.name}"`);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Sync failed", false);
    } finally {
      setSyncingIds((s) => {
        const n = new Set(s);
        n.delete(source.id);
        return n;
      });
    }
  }

  async function executeDelete(source: KnowledgeSource) {
    setDeletingIds((s) => new Set(s).add(source.id));
    try {
      unwrap(await adminApi.knowledge.remove({ params: { id: source.id } }));
      showToast(`"${source.name}" deleted`);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Delete failed", false);
    } finally {
      setDeletingIds((s) => {
        const n = new Set(s);
        n.delete(source.id);
        return n;
      });
    }
  }

  async function handleGrantKnowledgeSearch() {
    setGranting(true);
    try {
      const { policies } = unwrap(
        await adminApi.policies.list({ query: { agentDid: did } })
      );
      const activePolicies = policies
        .filter((p) => !p.expiresAt || new Date(p.expiresAt) > new Date())
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      const latestPolicy = activePolicies[0] ?? null;

      const baseCaps: string[] = latestPolicy?.capabilities ?? [
        ...capabilities,
      ];
      const newCaps = baseCaps.includes("knowledge_search")
        ? baseCaps
        : [...baseCaps, "knowledge_search"];

      if (latestPolicy) {
        await adminApi.policies.remove({ params: { id: latestPolicy.id } });
      }

      unwrap(
        await adminApi.policies.create({
          body: {
            agentDid: did,
            capabilities: newCaps,
            resourceLimits:
              (latestPolicy?.resourceLimits as Record<
                string,
                unknown
              > | null) ?? undefined,
          },
        })
      );

      showToast("knowledge_search granted — new policy applied");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to grant capability",
        false
      );
    } finally {
      setGranting(false);
    }
  }

  const getWorkspaceName = (id: string) =>
    workspaces.find((r) => r.id === id)?.name ?? id;
  const totalChunks = sources.reduce((sum, s) => sum + (s.chunkCount ?? 0), 0);
  const readyCount = sources.filter((s) => s.status === "ready").length;
  const hasFileSources = sources.some((s) => s.sourceType === "files");
  const hasReadySources = readyCount > 0;
  const hasKnowledgeCapability = capabilities.includes("knowledge_search");

  return (
    <div className="space-y-5">
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium text-white ${toast.ok ? "bg-success-600" : "bg-danger-600"}`}
        >
          {toast.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {toast.msg}
        </div>
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        title="Delete knowledge source"
        message={
          deleteTarget
            ? syncingIds.has(deleteTarget.id) ||
              deleteTarget.status === "syncing"
              ? `"${deleteTarget.name}" is currently syncing.\nDelete it anyway? The in-progress sync will be abandoned.`
              : `Delete "${deleteTarget.name}"?\nAll indexed chunks will be removed from this agent.`
            : ""
        }
        confirmLabel="Delete"
        variant="danger"
        onConfirm={async () => {
          const src = deleteTarget;
          setDeleteTarget(null);
          if (src) await executeDelete(src);
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              Knowledge Sources
            </h3>
            {hasFileSources && (
              <span
                title={
                  doclingConfigured
                    ? "Docling configured — PDF/DOCX parsing enabled"
                    : "Docling not configured — PDF/DOCX parsing unavailable"
                }
                className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${
                  doclingConfigured
                    ? "bg-success-100 text-success-700 border-success-300"
                    : "bg-warning-100 text-warning-700 border-warning-300"
                }`}
              >
                <FileType2 size={10} />
                {doclingConfigured ? "Docling on" : "Docling off"}
              </span>
            )}
          </div>
          <p className="text-xs text-foreground-500 mt-0.5">
            {sources.length === 0
              ? "No sources yet — add one to enable RAG search"
              : `${readyCount}/${sources.length} ready · ${totalChunks.toLocaleString()} chunks indexed`}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add source
        </button>
      </div>

      {!online && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-warning-50 border border-warning-200 text-xs text-warning-700">
          <WifiOff size={14} className="shrink-0" />
          Agent is offline. You can manage sources but syncing requires the
          agent to be connected.
        </div>
      )}

      {hasReadySources && !hasKnowledgeCapability && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-warning-50 border border-warning-200">
          <AlertTriangle
            size={16}
            className="shrink-0 mt-0.5 text-warning-600"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-warning-800">
              Knowledge sources are ready but the agent cannot use them
            </p>
            <p className="text-xs text-warning-700 mt-1">
              The{" "}
              <code className="bg-warning-100 px-1 rounded font-mono">
                knowledge_search
              </code>{" "}
              capability is not granted in this agent&apos;s active policy.
            </p>
            <p className="text-xs text-warning-600 mt-1">
              Granting this capability will create a new policy (replacing the
              current one) and immediately reissue the agent&apos;s certificate.
            </p>
          </div>
          <button
            onClick={handleGrantKnowledgeSearch}
            disabled={granting}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-warning-600 hover:bg-warning-500 disabled:opacity-60 text-white text-xs font-medium transition-colors"
          >
            {granting ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <ShieldCheck size={13} />
            )}
            {granting ? "Applying…" : "Grant capability"}
          </button>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-foreground-500">
          <Loader2 size={16} className="animate-spin" /> Loading…
        </div>
      )}

      {!loading && sources.length === 0 && (
        <div className="rounded-2xl border border-neutral-200 border-dashed bg-background/40 p-10 text-center space-y-3">
          <BookOpen className="w-7 h-7 text-foreground-400 mx-auto" />
          <p className="text-sm font-medium text-foreground">
            No knowledge sources yet
          </p>
          <p className="text-xs text-foreground-500 max-w-sm mx-auto">
            Connect URLs, paste inline text, or upload documents. Once synced
            and the{" "}
            <code className="bg-background-200 px-1 rounded text-primary-400">
              knowledge_search
            </code>{" "}
            capability is granted, the agent will use indexed content in every
            conversation.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors"
          >
            Add first source
          </button>
        </div>
      )}

      {!loading && sources.length > 0 && (
        <div className="space-y-3">
          {sources.map((source) => (
            <KsSourceCard
              key={source.id}
              source={source}
              workspaceName={getWorkspaceName(source.workspaceId)}
              isSyncing={
                syncingIds.has(source.id) || source.status === "syncing"
              }
              isDeleting={deletingIds.has(source.id)}
              isExpanded={expandedId === source.id}
              online={online}
              onToggleExpand={() =>
                setExpandedId(expandedId === source.id ? null : source.id)
              }
              onSync={() => handleSync(source)}
              onDelete={() => setDeleteTarget(source)}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <KsAddSourceModal
          did={did}
          workspaces={workspaces}
          doclingConfigured={doclingConfigured}
          onClose={() => setShowCreate(false)}
          onCreated={load}
        />
      )}
    </div>
  );
}
