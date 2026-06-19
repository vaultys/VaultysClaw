"use client";

import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import type { PendingApproval } from "./chat-types";

export function ToolApprovalCard({
  approval,
  onRespond,
}: {
  approval: PendingApproval;
  onRespond: (approved: boolean) => Promise<void>;
}) {
  const isDone =
    approval.status === "approved" || approval.status === "rejected";
  const isSubmitting = approval.status === "submitting";
  return (
    <div className="mx-auto max-w-[75%] rounded-xl border border-warning-500/30 bg-warning-950/20 p-3 text-sm">
      <p className="text-xs font-medium text-warning-400 mb-2">
        Tool approval required:{" "}
        <span className="font-mono">{approval.toolName}</span>
      </p>
      <details className="mb-3">
        <summary className="cursor-pointer text-xs text-foreground-500 hover:text-foreground select-none list-none">
          View arguments
        </summary>
        <pre className="mt-1 text-xs font-mono bg-background border border-neutral-200 rounded p-2 overflow-x-auto text-foreground whitespace-pre-wrap">
          {JSON.stringify(approval.args, null, 2)}
        </pre>
      </details>
      {isDone ? (
        <span
          className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
            approval.status === "approved"
              ? "bg-success-950/40 text-success-400 border border-success-500/30"
              : "bg-danger-950/40 text-danger-400 border border-danger-500/30"
          }`}
        >
          {approval.status === "approved" ? (
            <CheckCircle2 size={11} />
          ) : (
            <XCircle size={11} />
          )}
          {approval.status === "approved" ? "Approved" : "Rejected"}
        </span>
      ) : (
        <div className="flex gap-2">
          <button
            disabled={isSubmitting}
            onClick={() => onRespond(true)}
            className="flex items-center gap-1 px-3 py-1 text-xs rounded-lg bg-success-600 text-white hover:bg-success-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <CheckCircle2 size={11} />
            )}
            Approve
          </button>
          <button
            disabled={isSubmitting}
            onClick={() => onRespond(false)}
            className="flex items-center gap-1 px-3 py-1 text-xs rounded-lg bg-danger-700 text-white hover:bg-danger-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <XCircle size={11} />
            )}
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
