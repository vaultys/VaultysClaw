"use client";

import { Bell, CheckCircle, XCircle, X, Clock, GitBranch } from "lucide-react";
import { WorkflowApproval } from "@prisma/client";
import { StatusBadge } from "./StatusBadge";

export function ApprovalCard({
  item,
  comment,
  onCommentChange,
  acting,
  onApprove,
  onReject,
  onDismiss,
}: {
  item: WorkflowApproval;
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
      className={`rounded-xl border bg-background-100 ${
        isPending && !isNotification
          ? "border-warning-300"
          : isNotification && item.status === "notified"
            ? "border-primary-300"
            : "border-neutral-200"
      }`}
    >
      {/* Card header */}
      <div className="flex items-start gap-3 p-4">
        <div
          className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${
            isPending && !isNotification
              ? "bg-warning-100"
              : isNotification
                ? "bg-primary-100"
                : "bg-background-200"
          }`}
        >
          {isNotification ? (
            <Bell size={15} className="text-primary-500" />
          ) : (
            <GitBranch size={15} className="text-warning-600" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-foreground">
              {item.workflowName}
            </span>
            <StatusBadge status={item.status} />
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
