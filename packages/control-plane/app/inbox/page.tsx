"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Bell, CheckCircle, XCircle, X, Clock, GitBranch, RefreshCcw } from "lucide-react";

interface Approval {
  id: string;
  run_id: string;
  step_id: string;
  workflow_id: string;
  workflow_name: string;
  node_message: string | null;
  step_input: string | null;
  assigned_user_id: string;
  mode: "approval" | "notification";
  status: string;
  decided_at: string | null;
  decided_by: string | null;
  comment: string | null;
  created_at: string;
}

export default function InboxPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [comment, setComment] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"pending" | "all">("pending");

  const fetchApprovals = useCallback(async () => {
    try {
      const res = await fetch("/api/workflow-approvals?all=1");
      if (!res.ok) return;
      const data = (await res.json()) as { approvals: Approval[] };
      setApprovals(data.approvals);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApprovals();
    const interval = setInterval(fetchApprovals, 15_000);
    return () => clearInterval(interval);
  }, [fetchApprovals]);

  const handleApprove = async (id: string) => {
    setActing(id);
    try {
      await fetch(`/api/workflow-approvals/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: comment[id] || undefined }),
      });
      await fetchApprovals();
    } finally {
      setActing(null);
    }
  };

  const handleReject = async (id: string) => {
    setActing(id);
    try {
      await fetch(`/api/workflow-approvals/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: comment[id] || undefined }),
      });
      await fetchApprovals();
    } finally {
      setActing(null);
    }
  };

  const handleDismiss = async (id: string) => {
    setActing(id);
    try {
      await fetch(`/api/workflow-approvals/${id}/dismiss`, { method: "POST" });
      await fetchApprovals();
    } finally {
      setActing(null);
    }
  };

  const displayed = filter === "pending"
    ? approvals.filter((a) => a.status === "pending" || a.status === "notified")
    : approvals;

  const pendingCount = approvals.filter((a) => a.status === "pending" || a.status === "notified").length;

  return (
    <div className="p-6 w-full max-w-7xl mx-auto space-y-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-vc-text flex items-center gap-2">
            <Bell size={22} className="text-indigo-700 dark:text-indigo-400" />
            Inbox
          </h1>
          <p className="text-sm text-vc-muted mt-1">
            Workflow approvals and notifications assigned to you
          </p>
        </div>
        <button
          onClick={fetchApprovals}
          className="flex items-center gap-1.5 text-xs text-vc-muted hover:text-vc-text px-3 py-1.5 rounded border border-vc-border hover:bg-vc-raised"
        >
          <RefreshCcw size={13} /> Refresh
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5 border-b border-vc-border">
        <button
          onClick={() => setFilter("pending")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${filter === "pending"
            ? "border-indigo-500 text-indigo-700 dark:text-indigo-400"
            : "border-transparent text-vc-muted hover:text-vc-text"
            }`}
        >
          Pending
          {pendingCount > 0 && (
            <span className="ml-2 bg-indigo-500 text-white text-xs rounded-full px-1.5 py-0.5">
              {pendingCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setFilter("all")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${filter === "all"
            ? "border-indigo-500 text-indigo-700 dark:text-indigo-400"
            : "border-transparent text-vc-muted hover:text-vc-text"
            }`}
        >
          All
          <span className="ml-2 text-xs text-vc-subtle">({approvals.length})</span>
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-16 text-vc-muted">
          <Bell size={40} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">No {filter === "pending" ? "pending" : ""} items</p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map((item) => (
            <ApprovalCard
              key={item.id}
              item={item}
              comment={comment[item.id] || ""}
              onCommentChange={(v) => setComment((c) => ({ ...c, [item.id]: v }))}
              acting={acting === item.id}
              onApprove={() => handleApprove(item.id)}
              onReject={() => handleReject(item.id)}
              onDismiss={() => handleDismiss(item.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status, mode }: { status: string; mode: string }) {
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: "Pending", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
    notified: { label: "Notified", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
    approved: { label: "Approved", className: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
    rejected: { label: "Rejected", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
    dismissed: { label: "Dismissed", className: "bg-vc-raised text-vc-muted" },
  };
  const s = map[status] ?? { label: status, className: "bg-vc-raised text-vc-muted" };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.className}`}>
      {s.label}
    </span>
  );
}

function ApprovalCard({
  item,
  comment,
  onCommentChange,
  acting,
  onApprove,
  onReject,
  onDismiss,
}: {
  item: Approval;
  comment: string;
  onCommentChange: (v: string) => void;
  acting: boolean;
  onApprove: () => void;
  onReject: () => void;
  onDismiss: () => void;
}) {
  const isPending = item.status === "pending";
  const isNotification = item.mode === "notification";
  const isDone = ["approved", "rejected", "dismissed"].includes(item.status);

  return (
    <div className={`rounded-xl border bg-vc-surface ${isPending && !isNotification
      ? "border-amber-300 dark:border-amber-700"
      : isNotification && item.status === "notified"
        ? "border-blue-300 dark:border-blue-700"
        : "border-vc-border"
      }`}>
      {/* Card header */}
      <div className="flex items-start gap-3 p-4">
        <div className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${isPending && !isNotification ? "bg-amber-100 dark:bg-amber-900/30" :
          isNotification ? "bg-blue-100 dark:bg-blue-900/30" :
            "bg-vc-raised"
          }`}>
          {isNotification
            ? <Bell size={15} className="text-blue-500" />
            : <GitBranch size={15} className="text-amber-600 dark:text-amber-400" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-vc-text">{item.workflow_name}</span>
            <StatusBadge status={item.status} mode={item.mode} />
            <span className="text-xs text-vc-subtle ml-auto whitespace-nowrap">
              {new Date(item.created_at).toLocaleString()}
            </span>
          </div>

          {item.node_message && (
            <p className="text-sm text-vc-text-2 mt-1">{item.node_message}</p>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-xs text-vc-muted">
            <span><span className="font-medium">Step:</span> {item.step_id}</span>
            <span><span className="font-medium">Run:</span> <span className="font-mono">{item.run_id.slice(0, 8)}…</span></span>
            <span><span className="font-medium">Type:</span> {item.mode === "approval" ? "Approval required" : "Notification"}</span>
          </div>
        </div>
      </div>

      {/* Workflow input */}
      {item.step_input && (
        <div className="px-4 pb-3">
          <p className="text-xs font-medium text-vc-text-2 mb-1">Workflow input</p>
          <pre className="text-xs bg-vc-raised text-vc-text border border-vc-border rounded-lg p-3 overflow-x-auto max-h-28 whitespace-pre-wrap break-words">
            {item.step_input}
          </pre>
        </div>
      )}

      {/* Decision info (already decided) */}
      {isDone && item.decided_at && (
        <div className="px-4 pb-3 flex items-center gap-2 text-xs text-vc-muted">
          <Clock size={12} />
          Decided {new Date(item.decided_at).toLocaleString()}
          {item.comment && <span className="ml-2 italic">"{item.comment}"</span>}
        </div>
      )}

      {/* Actions */}
      {!isDone && (
        <div className="px-4 pb-4 space-y-2 border-t border-vc-border mt-1 pt-3">
          {isPending && !isNotification && (
            <>
              <textarea
                rows={2}
                value={comment}
                onChange={(e) => onCommentChange(e.target.value)}
                placeholder="Add a comment (optional)…"
                className="w-full text-xs bg-vc-raised text-vc-text border border-vc-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-400 resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={onApprove}
                  disabled={acting}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
                >
                  <CheckCircle size={14} /> Approve
                </button>
                <button
                  onClick={onReject}
                  disabled={acting}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium"
                >
                  <XCircle size={14} /> Reject
                </button>
              </div>
            </>
          )}
          {isNotification && item.status === "notified" && (
            <button
              onClick={onDismiss}
              disabled={acting}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-vc-border text-vc-muted text-sm rounded-lg hover:bg-vc-raised disabled:opacity-50"
            >
              <X size={13} /> Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  );
}
