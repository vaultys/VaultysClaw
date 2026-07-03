"use client";

import { useState, useCallback, useEffect } from "react";
import { ShieldCheck } from "lucide-react";
import {
  adminApi,
  unwrap,
} from "@/lib/api/ts-rest/client";
import { ToolApproval } from "@/lib/ws-server";

export function ApprovalsTab({
  onCountChange,
}: Readonly<{
  onCountChange: (n: number) => void;
}>) {
  const [approvals, setApprovals] = useState<ToolApproval[]>([]);

  const refresh = useCallback(async () => {
    try {
      const { approvals } = unwrap(await adminApi.toolApprovals.list());
      const list = approvals as ToolApproval[];
      setApprovals(list);
      onCountChange(list.length);
    } catch {
      setApprovals([]);
      onCountChange(0);
    }
  }, [onCountChange]);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 5000);
    return () => clearInterval(iv);
  }, [refresh]);

  const respond = async (requestId: string, approved: boolean) => {
    await adminApi.toolApprovals.respond({ body: { requestId, approved } });
    refresh();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Tool Approvals
          </h2>
          <p className="text-xs text-foreground-500 mt-0.5">
            Review and approve or reject pending tool use requests.
          </p>
        </div>
        <button
          onClick={refresh}
          className="text-xs text-foreground-500 hover:text-foreground border border-neutral-300 px-2.5 py-1 rounded-md transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      {approvals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-foreground-500 gap-2">
          <ShieldCheck size={36} strokeWidth={1} />
          <p className="text-sm">No pending tool approvals</p>
        </div>
      ) : (
        <div className="space-y-3">
          {approvals.map((a) => (
            <div
              key={a.requestId}
              className="bg-background-200 rounded-lg p-4 border border-neutral-200"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <span className="font-mono text-sm text-foreground font-medium">
                    {a.toolName}
                  </span>
                  {a.agentName && (
                    <span className="ml-2 text-xs text-foreground-500">
                      from {a.agentName}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => respond(a.requestId, true)}
                    className="px-3 py-1 text-xs bg-success-600 text-white rounded-md hover:bg-success-500 transition-colors"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => respond(a.requestId, false)}
                    className="px-3 py-1 text-xs bg-danger-600/80 text-white rounded-md hover:bg-danger-600 transition-colors"
                  >
                    Reject
                  </button>
                </div>
              </div>

              <pre className="mt-2 text-xs font-mono text-foreground-700 bg-background-100 border border-neutral-200 rounded p-2 overflow-x-auto">
                {JSON.stringify(a.args, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
