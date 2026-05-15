"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { CheckCircle, XCircle, Bell, X, ChevronDown, ChevronUp } from "lucide-react";

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
  created_at: string;
}

export default function WorkflowApprovalInbox() {
  const { status } = useSession();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [comment, setComment] = useState<Record<string, string>>({});
  const [acting, setActing] = useState<string | null>(null);

  const fetchApprovals = useCallback(async () => {
    if (status !== "authenticated") return;
    try {
      const res = await fetch("/api/workflow-approvals");
      if (!res.ok) return;
      const data = (await res.json()) as { approvals: Approval[] };
      setApprovals(data.approvals);
    } catch {
      // silently ignore polling errors
    }
  }, [status]);

  // Poll every 15 seconds
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

  if (status !== "authenticated" || approvals.length === 0) return null;

  const pendingApprovals = approvals.filter((a) => a.mode === "approval");
  const notifications = approvals.filter((a) => a.mode === "notification");

  return (
    <div className="border-b border-vc-border bg-vc-raised">
      {/* Approvals (blocking) */}
      {pendingApprovals.map((approval) => (
        <div key={approval.id} className="border-b border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
          <div
            className="flex items-center gap-3 px-4 py-3 cursor-pointer"
            onClick={() => setExpanded(expanded === approval.id ? null : approval.id)}
          >
            <Bell size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="text-sm font-medium text-amber-900 dark:text-amber-200 flex-1">
              Awaiting your approval — <strong>{approval.workflow_name}</strong>
            </span>
            <span className="text-xs text-amber-700 dark:text-amber-400">
              {new Date(approval.created_at).toLocaleString()}
            </span>
            {expanded === approval.id ? (
              <ChevronUp size={14} className="text-amber-600 dark:text-amber-400" />
            ) : (
              <ChevronDown size={14} className="text-amber-600 dark:text-amber-400" />
            )}
          </div>

          {expanded === approval.id && (
            <div className="px-4 pb-4 space-y-3">
              {/* Details */}
              <div className="grid grid-cols-2 gap-2 text-xs text-amber-800 dark:text-amber-300 bg-amber-100/60 dark:bg-amber-900/30 rounded-md p-3">
                <div><span className="font-semibold">Workflow:</span> {approval.workflow_name}</div>
                <div><span className="font-semibold">Step:</span> {approval.step_id}</div>
                <div><span className="font-semibold">Run ID:</span> <span className="font-mono">{approval.run_id.slice(0, 8)}…</span></div>
              </div>

              {approval.node_message && (
                <div className="text-sm text-amber-900 dark:text-amber-200 bg-amber-100 dark:bg-amber-900/40 rounded-md p-3">
                  <p className="font-semibold text-xs mb-1">Message</p>
                  <p>{approval.node_message}</p>
                </div>
              )}

              {approval.step_input && (
                <div>
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1">Workflow input</p>
                  <pre className="text-xs bg-vc-surface text-vc-text border border-vc-border rounded-md p-2 overflow-x-auto max-h-32">
                    {approval.step_input}
                  </pre>
                </div>
              )}

              {/* Comment */}
              <div>
                <label className="text-xs font-medium text-amber-800 dark:text-amber-300 block mb-1">Comment (optional)</label>
                <textarea
                  rows={2}
                  value={comment[approval.id] || ""}
                  onChange={(e) => setComment((c) => ({ ...c, [approval.id]: e.target.value }))}
                  className="w-full text-xs bg-vc-surface text-vc-text border border-vc-border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-400 resize-none"
                  placeholder="Add a comment…"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => handleApprove(approval.id)}
                  disabled={acting === approval.id}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50 font-medium"
                >
                  <CheckCircle size={14} /> Approve
                </button>
                <button
                  onClick={() => handleReject(approval.id)}
                  disabled={acting === approval.id}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 disabled:opacity-50 font-medium"
                >
                  <XCircle size={14} /> Reject
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Notifications (non-blocking) */}
      {notifications.map((notif) => (
        <div key={notif.id} className="flex items-start gap-3 px-4 py-3 border-b border-vc-border bg-blue-50 dark:bg-blue-900/10">
          <Bell size={15} className="text-blue-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-blue-900 dark:text-blue-200">
              <strong>{notif.workflow_name}</strong> — {notif.node_message || `Step ${notif.step_id} reached`}
            </p>
            {notif.step_input && (
              <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5 truncate">{notif.step_input.slice(0, 120)}</p>
            )}
          </div>
          <span className="text-xs text-blue-600 dark:text-blue-400 whitespace-nowrap">
            {new Date(notif.created_at).toLocaleString()}
          </span>
          <button
            onClick={() => handleDismiss(notif.id)}
            disabled={acting === notif.id}
            className="p-1 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded"
            title="Dismiss"
          >
            <X size={14} className="text-blue-500" />
          </button>
        </div>
      ))}
    </div>
  );
}
