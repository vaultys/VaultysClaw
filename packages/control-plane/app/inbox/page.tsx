"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Bell,
  CheckCircle,
  XCircle,
  X,
  Clock,
  GitBranch,
  RefreshCcw,
} from "lucide-react";

interface Approval {
  id: string;
  runId: string;
  stepId: string;
  workflowId: string;
  workflowName: string;
  nodeMessage: string | null;
  stepInput: string | null;
  assignedUserId: string;
  mode: "approval" | "notification";
  status: string;
  decidedAt: string | null;
  decidedBy: string | null;
  comment: string | null;
  createdAt: string;
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

  const displayed =
    filter === "pending"
      ? approvals.filter(
        (a) => a.status === "pending" || a.status === "notified"
      )
      : approvals;

  const pendingCount = approvals.filter(
    (a) => a.status === "pending" || a.status === "notified"
  ).length;

  return (
    <div className="p-6 w-full max-w-7xl mx-auto space-y-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Bell
              size={22}
              className="text-primary-700"
            />
            Inbox
          </h1>
          <p className="text-sm text-foreground-500 mt-1">
            Workflow approvals and notifications assigned to you
          </p>
        </div>
        <button
          onClick={fetchApprovals}
          className="flex items-center gap-1.5 text-xs text-foreground-500 hover:text-foreground px-3 py-1.5 rounded border border-neutral-200 hover:bg-background-200"
        >
          <RefreshCcw size={13} /> Refresh
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5 border-b border-neutral-200">
        <button
          onClick={() => setFilter("pending")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${filter === "pending"
            ? "border-primary-500 text-primary-700"
            : "border-transparent text-foreground-500 hover:text-foreground"
            }`}
        >
          Pending
          {pendingCount > 0 && (
            <span className="ml-2 bg-primary-500 text-white text-xs rounded-full px-1.5 py-0.5">
              {pendingCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setFilter("all")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${filter === "all"
            ? "border-primary-500 text-primary-700"
            : "border-transparent text-foreground-500 hover:text-foreground"
            }`}
        >
          All
          <span className="ml-2 text-xs text-foreground-400">
            ({approvals.length})
          </span>
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-16 text-foreground-500">
          <Bell size={40} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">
            No {filter === "pending" ? "pending" : ""} items
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map((item) => (
            <ApprovalCard
              key={item.id}
              item={item}
              comment={comment[item.id] || ""}
              onCommentChange={(v) =>
                setComment((c) => ({ ...c, [item.id]: v }))
              }
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
    pending: {
      label: "Pending",
      className:
        "bg-warning-100 text-warning-700",
    },
    notified: {
      label: "Notified",
      className:
        "bg-primary-100 text-primary-700",
    },
    approved: {
      label: "Approved",
      className:
        "bg-success-100 text-success-700",
    },
    rejected: {
      label: "Rejected",
      className:
        "bg-danger-100 text-danger-700",
    },
    dismissed: {
      label: "Dismissed",
      className: "bg-background-200 text-foreground-500",
    },
  };
  const s = map[status] ?? {
    label: status,
    className: "bg-background-200 text-foreground-500",
  };
  return (
    <span
      className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.className}`}
    >
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
    <div
      className={`rounded-xl border bg-background-100 ${isPending && !isNotification
        ? "border-warning-300"
        : isNotification && item.status === "notified"
          ? "border-primary-300"
          : "border-neutral-200"
        }`}
    >
      {/* Card header */}
      <div className="flex items-start gap-3 p-4">
        <div
          className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${isPending && !isNotification
            ? "bg-warning-100"
            : isNotification
              ? "bg-primary-100"
              : "bg-background-200"
            }`}
        >
          {isNotification ? (
            <Bell size={15} className="text-primary-500" />
          ) : (
            <GitBranch
              size={15}
              className="text-warning-600"
            />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-foreground">
              {item.workflowName}
            </span>
            <StatusBadge status={item.status} mode={item.mode} />
            <span className="text-xs text-foreground-400 ml-auto whitespace-nowrap">
              {new Date(item.createdAt).toLocaleString()}
            </span>
          </div>

          {item.nodeMessage && (
            <p className="text-sm text-foreground-700 mt-1">
              {item.nodeMessage}
            </p>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-xs text-foreground-500">
            <span>
              <span className="font-medium">Step:</span> {item.stepId}
            </span>
            <span>
              <span className="font-medium">Run:</span>{" "}
              <span className="font-mono">{item.runId.slice(0, 8)}…</span>
            </span>
            <span>
              <span className="font-medium">Type:</span>{" "}
              {item.mode === "approval" ? "Approval required" : "Notification"}
            </span>
          </div>
        </div>
      </div>

      {/* Workflow input */}
      {item.stepInput && (
        <div className="px-4 pb-3">
          <p className="text-xs font-medium text-foreground-700 mb-1">
            Workflow input
          </p>
          <pre className="text-xs bg-background-200 text-foreground border border-neutral-200 rounded-lg p-3 overflow-x-auto max-h-28 whitespace-pre-wrap break-words">
            {item.stepInput}
          </pre>
        </div>
      )}

      {/* Decision info (already decided) */}
      {isDone && item.decidedAt && (
        <div className="px-4 pb-3 flex items-center gap-2 text-xs text-foreground-500">
          <Clock size={12} />
          Decided {new Date(item.decidedAt).toLocaleString()}
          {item.comment && (
            <span className="ml-2 italic">"{item.comment}"</span>
          )}
        </div>
      )}

      {/* Actions */}
      {!isDone && (
        <div className="px-4 pb-4 space-y-2 border-t border-neutral-200 mt-1 pt-3">
          {isPending && !isNotification && (
            <>
              <textarea
                rows={2}
                value={comment}
                onChange={(e) => onCommentChange(e.target.value)}
                placeholder="Add a comment (optional)…"
                className="w-full text-xs bg-background-200 text-foreground border border-neutral-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-warning-400 resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={onApprove}
                  disabled={acting}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-success-600 text-white text-sm rounded-lg hover:bg-success-700 disabled:opacity-50 font-medium"
                >
                  <CheckCircle size={14} /> Approve
                </button>
                <button
                  onClick={onReject}
                  disabled={acting}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-danger-600 text-white text-sm rounded-lg hover:bg-danger-700 disabled:opacity-50 font-medium"
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
              className="flex items-center gap-1.5 px-3 py-1.5 border border-neutral-200 text-foreground-500 text-sm rounded-lg hover:bg-background-200 disabled:opacity-50"
            >
              <X size={13} /> Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  );
}
