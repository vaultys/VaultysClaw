"use client";

import { useEffect, useState, useCallback } from "react";
import { Bell, RefreshCcw } from "lucide-react";
import { workflowApprovalsClient, unwrap } from "@/lib/api/ts-rest/client";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import { WorkflowApproval } from "@prisma/client";
import { ApprovalCard } from "../../components/inbox/ApprovalCard";

export default function InboxPage() {
  const [approvals, setApprovals] = useState<WorkflowApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [comment, setComment] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"pending" | "all">("pending");

  const fetchApprovals = useCallback(async () => {
    try {
      const data = unwrap(
        await workflowApprovalsClient.list({ query: { all: "1" } })
      );
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

  const displayed =
    filter === "pending"
      ? approvals.filter(
          (a) => a.status === "pending" || a.status === "notified"
        )
      : approvals;

  const pendingCount = approvals.filter(
    (a) => a.status === "pending" || a.status === "notified"
  ).length;

  useBreadcrumbs([{ label: "Inbox" }], []);

  useToolbar(
    {
      title: "Inbox",
      description: "Workflow approvals and notifications assigned to you",
      actions: [
        {
          kind: "tabs",
          id: "filter",
          value: filter,
          onChange: (v) => setFilter(v as "pending" | "all"),
          options: [
            {
              value: "pending",
              label: pendingCount > 0 ? `Pending (${pendingCount})` : "Pending",
            },
            { value: "all", label: `All (${approvals.length})` },
          ],
        },
        {
          kind: "button",
          id: "refresh",
          label: "Refresh",
          icon: <RefreshCcw className="w-3.5 h-3.5" />,
          onClick: () => fetchApprovals(),
        },
      ],
    },
    [filter, pendingCount, approvals.length, fetchApprovals]
  );

  return (
    <div className="p-6 w-full max-w-7xl mx-auto space-y-0">
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
