"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  CheckCircle,
  XCircle,
  Bell,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { workflowApprovalsClient, unwrap } from "@/lib/api/ts-rest/client";

// Prisma returns camelCase — the DB @map() directives only affect the column
// names, not the JavaScript property names returned by the ORM.
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
  createdAt: string;
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
      const data = unwrap(await workflowApprovalsClient.list({ query: {} }));
      setApprovals(data.approvals as unknown as Approval[]);
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
      await workflowApprovalsClient.approve({
        params: { id },
        body: { comment: comment[id] || undefined },
      });
      await fetchApprovals();
    } finally {
      setActing(null);
    }
  };

  const handleReject = async (id: string) => {
    setActing(id);
    try {
      await workflowApprovalsClient.reject({
        params: { id },
        body: { comment: comment[id] || undefined },
      });
      await fetchApprovals();
    } finally {
      setActing(null);
    }
  };

  const handleDismiss = async (id: string) => {
    setActing(id);
    try {
      await workflowApprovalsClient.dismiss({ params: { id } });
      await fetchApprovals();
    } finally {
      setActing(null);
    }
  };

  if (status !== "authenticated" || approvals.length === 0) return null;

  const pendingApprovals = approvals.filter((a) => a.mode === "approval");
  const notifications = approvals.filter((a) => a.mode === "notification");

  return (
    <div className="border-b border-neutral-200 bg-background-200">
      {/* Approvals (blocking) */}
      {pendingApprovals.map((approval) => (
        <div
          key={approval.id}
          className="border-b border-warning-200 bg-warning-50"
        >
          <div
            className="flex items-center gap-3 px-4 py-3 cursor-pointer"
            onClick={() =>
              setExpanded(expanded === approval.id ? null : approval.id)
            }
          >
            <Bell size={16} className="text-warning-600 shrink-0" />
            <span className="text-sm font-medium text-warning-900 flex-1">
              Awaiting your approval — <strong>{approval.workflowName}</strong>
            </span>
            <span className="text-xs text-warning-700">
              {new Date(approval.createdAt).toLocaleString()}
            </span>
            {expanded === approval.id ? (
              <ChevronUp size={14} className="text-warning-600" />
            ) : (
              <ChevronDown size={14} className="text-warning-600" />
            )}
          </div>

          {expanded === approval.id && (
            <div className="px-4 pb-4 space-y-3">
              {/* Details */}
              <div className="grid grid-cols-2 gap-2 text-xs text-warning-800 bg-warning-100/60 rounded-md p-3">
                <div>
                  <span className="font-semibold">Workflow:</span>{" "}
                  {approval.workflowName}
                </div>
                <div>
                  <span className="font-semibold">Step:</span>{" "}
                  {approval.stepId}
                </div>
                <div>
                  <span className="font-semibold">Run ID:</span>{" "}
                  <span className="font-mono">
                    {approval.runId?.slice(0, 8) ?? "—"}…
                  </span>
                </div>
              </div>

              {approval.nodeMessage && (
                <div className="text-sm text-warning-900 bg-warning-100 rounded-md p-3">
                  <p className="font-semibold text-xs mb-1">Message</p>
                  <p>{approval.nodeMessage}</p>
                </div>
              )}

              {approval.stepInput && (
                <div>
                  <p className="text-xs font-semibold text-warning-800 mb-1">
                    Workflow input
                  </p>
                  <pre className="text-xs bg-background-100 text-foreground border border-neutral-200 rounded-md p-2 overflow-x-auto max-h-32">
                    {approval.stepInput}
                  </pre>
                </div>
              )}

              {/* Comment */}
              <div>
                <label className="text-xs font-medium text-warning-800 block mb-1">
                  Comment (optional)
                </label>
                <textarea
                  rows={2}
                  value={comment[approval.id] || ""}
                  onChange={(e) =>
                    setComment((c) => ({ ...c, [approval.id]: e.target.value }))
                  }
                  className="w-full text-xs bg-background-100 text-foreground border border-neutral-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-warning-400 resize-none"
                  placeholder="Add a comment…"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => handleApprove(approval.id)}
                  disabled={acting === approval.id}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-success-600 text-white text-sm rounded-md hover:bg-success-700 disabled:opacity-50 font-medium"
                >
                  <CheckCircle size={14} /> Approve
                </button>
                <button
                  onClick={() => handleReject(approval.id)}
                  disabled={acting === approval.id}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-danger-600 text-white text-sm rounded-md hover:bg-danger-700 disabled:opacity-50 font-medium"
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
        <div
          key={notif.id}
          className="flex items-start gap-3 px-4 py-3 border-b border-neutral-200 bg-primary-50"
        >
          <Bell size={15} className="text-primary-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-primary-900">
              <strong>{notif.workflowName}</strong> —{" "}
              {notif.nodeMessage || `Step ${notif.stepId} reached`}
            </p>
            {notif.stepInput && (
              <p className="text-xs text-primary-700 mt-0.5 truncate">
                {notif.stepInput.slice(0, 120)}
              </p>
            )}
          </div>
          <span className="text-xs text-primary-600 whitespace-nowrap">
            {new Date(notif.createdAt).toLocaleString()}
          </span>
          <button
            onClick={() => handleDismiss(notif.id)}
            disabled={acting === notif.id}
            className="p-1 hover:bg-primary-100 rounded"
            title="Dismiss"
          >
            <X size={14} className="text-primary-500" />
          </button>
        </div>
      ))}
    </div>
  );
}
