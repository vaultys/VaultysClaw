"use client";

import { type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCheck,
  CheckCircle,
  Inbox,
  X,
  XCircle,
} from "lucide-react";
import { timeAgo } from "@vaultysclaw/shared";
import type { WorkflowApprovalItem } from "@/lib/contracts";

type ApprovalAction = "approve" | "reject" | "dismiss";

export function MyQueuePanel({
  pendingApprovals,
  notifications,
  comment,
  setComment,
  acting,
  onAct,
}: {
  pendingApprovals: WorkflowApprovalItem[];
  notifications: WorkflowApprovalItem[];
  comment: Record<string, string>;
  setComment: Dispatch<SetStateAction<Record<string, string>>>;
  acting: string | null;
  onAct: (id: string, action: ApprovalAction) => void;
}) {
  const router = useRouter();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-foreground-400 uppercase tracking-widest px-0.5">
          My Queue
        </h2>
        {(pendingApprovals.length > 0 || notifications.length > 0) && (
          <button
            onClick={() => router.push("/app/inbox")}
            className="text-xs text-primary-600 hover:underline"
          >
            View all
          </button>
        )}
      </div>

      {/* Pending approvals */}
      <div className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-gradient-to-r from-warning-50/60 to-transparent">
          <div className="flex items-center gap-2">
            <Inbox className="w-4 h-4 text-warning-600" />
            <span className="text-sm font-semibold text-foreground">
              Pending Approvals
            </span>
            {pendingApprovals.length > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold text-warning-700 bg-warning-100 rounded-full">
                {pendingApprovals.length}
              </span>
            )}
          </div>
        </div>

        {pendingApprovals.length === 0 ? (
          <div className="px-4 py-8 flex flex-col items-center gap-2 text-center">
            <CheckCheck className="w-7 h-7 text-success-400 opacity-60" />
            <p className="text-sm text-foreground-400">You're all caught up</p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-100 max-h-[360px] overflow-y-auto">
            {pendingApprovals.map((item) => (
              <div key={item.id} className="p-4 space-y-2.5">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-sm text-foreground leading-tight">
                      {item.workflowName}
                    </p>
                    <span className="text-[10px] text-foreground-400 whitespace-nowrap">
                      {timeAgo(item.createdAt.toString())}
                    </span>
                  </div>
                  {item.nodeMessage && (
                    <p className="text-xs text-foreground-600 mt-1 leading-relaxed">
                      {item.nodeMessage}
                    </p>
                  )}
                  <p className="text-[11px] text-foreground-400 mt-0.5">
                    Step: {item.stepId}
                  </p>
                </div>

                {item.stepInput && (
                  <pre className="text-[11px] bg-background-200 text-foreground border border-neutral-200 rounded-lg p-2 overflow-x-auto max-h-16 whitespace-pre-wrap break-words">
                    {item.stepInput.slice(0, 160)}
                    {item.stepInput.length > 160 ? "…" : ""}
                  </pre>
                )}

                <div className="space-y-2">
                  <textarea
                    rows={1}
                    value={comment[item.id] || ""}
                    onChange={(e) =>
                      setComment((c) => ({ ...c, [item.id]: e.target.value }))
                    }
                    placeholder="Comment (optional)…"
                    className="w-full text-xs bg-background-200 text-foreground border border-neutral-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-warning-400 resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => onAct(item.id, "approve")}
                      disabled={acting === item.id}
                      className="flex items-center gap-1 px-3 py-1.5 bg-success-600 text-white text-xs rounded-lg hover:bg-success-700 disabled:opacity-50 font-medium transition-colors"
                    >
                      <CheckCircle size={12} /> Approve
                    </button>
                    <button
                      onClick={() => onAct(item.id, "reject")}
                      disabled={acting === item.id}
                      className="flex items-center gap-1 px-3 py-1.5 bg-danger-600 text-white text-xs rounded-lg hover:bg-danger-700 disabled:opacity-50 font-medium transition-colors"
                    >
                      <XCircle size={12} /> Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Notifications */}
      <div className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-gradient-to-r from-primary-50/40 to-transparent">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary-500" />
            <span className="text-sm font-semibold text-foreground">
              Notifications
            </span>
            {notifications.length > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold text-primary-700 bg-primary-100 rounded-full">
                {notifications.length}
              </span>
            )}
          </div>
        </div>

        {notifications.length === 0 ? (
          <div className="px-4 py-6 flex flex-col items-center gap-2 text-center">
            <Bell className="w-6 h-6 text-foreground-200" />
            <p className="text-xs text-foreground-400">No new notifications</p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-100 max-h-[280px] overflow-y-auto">
            {notifications.map((item) => (
              <div key={item.id} className="flex items-start gap-3 px-4 py-3">
                <Bell size={13} className="text-primary-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground leading-tight">
                    {item.workflowName}
                  </p>
                  {item.nodeMessage && (
                    <p className="text-xs text-foreground-600 mt-0.5">
                      {item.nodeMessage}
                    </p>
                  )}
                  <p className="text-[10px] text-foreground-400 mt-0.5">
                    {timeAgo(item.createdAt.toString())} · {item.stepId}
                  </p>
                </div>
                <button
                  onClick={() => onAct(item.id, "dismiss")}
                  disabled={acting === item.id}
                  className="p-1 hover:bg-background-200 rounded text-foreground-400 hover:text-foreground disabled:opacity-50 shrink-0 transition-colors"
                  title="Dismiss"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
