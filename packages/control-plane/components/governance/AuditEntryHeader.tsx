import {
  Activity,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  Bot,
  Link2,
  AlertTriangle,
} from "lucide-react";
import { shortDid } from "@vaultysclaw/shared";
import type { AuditEntryDetail } from "@/lib/contracts";
import { ACTIVITY_LABELS, formatAuditDate } from "./constants";

export function AuditEntryHeader({
  entry,
  onOpenAgent,
}: {
  entry: AuditEntryDetail;
  onOpenAgent: (did: string) => void;
}) {
  const isActivity = entry.source === "activity";

  return (
    <>
      {/* Header card */}
      <div className="bg-background-100 border border-neutral-200 rounded-xl p-5">
        <div className="flex items-start gap-4">
          <div
            className={`p-2.5 rounded-lg border flex-shrink-0 ${
              isActivity
                ? "bg-primary-100 border-primary-300 text-primary-600"
                : "bg-secondary-100 border-secondary-300 text-secondary-600"
            }`}
          >
            {isActivity ? <Activity size={18} /> : <FileText size={18} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-base font-semibold text-foreground">
                {ACTIVITY_LABELS[entry.event] ?? entry.event.replace(/_/g, " ")}
              </h1>
              {/* Source badge */}
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${
                  isActivity
                    ? "bg-primary-100 text-primary-700 border-primary-300"
                    : "bg-secondary-100 text-secondary-700 border-secondary-300"
                }`}
              >
                {entry.source}
              </span>
              {/* Status badge */}
              {entry.status === "success" && (
                <span className="flex items-center gap-1 text-xs text-success-700">
                  <CheckCircle2 size={12} /> success
                </span>
              )}
              {entry.status === "failed" && (
                <span className="flex items-center gap-1 text-xs text-danger-600">
                  <XCircle size={12} /> failed
                </span>
              )}
              {entry.status &&
                entry.status !== "success" &&
                entry.status !== "failed" && (
                  <span className="flex items-center gap-1 text-xs text-warning-600">
                    <Clock size={12} /> {entry.status}
                  </span>
                )}
            </div>

            {/* Meta row */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground-500">
              <span className="flex items-center gap-1">
                <Clock size={11} /> {formatAuditDate(entry.timestamp)}
              </span>
              {entry.agentDid && (
                <span
                  className="flex items-center gap-1 cursor-pointer hover:text-primary-500 transition-colors"
                  title={entry.agentDid}
                  onClick={() => onOpenAgent(entry.agentDid!)}
                >
                  <Bot size={11} />
                  {entry.agentName ?? shortDid(entry.agentDid)}
                  <Link2 size={10} className="opacity-60" />
                </span>
              )}
              {entry.durationMs !== null && (
                <span className="flex items-center gap-1">
                  <Clock size={11} /> {entry.durationMs}ms
                </span>
              )}
            </div>

            {/* Entry ID */}
            <p className="text-[10px] font-mono text-foreground-400 mt-1.5">
              {entry.id}
            </p>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {entry.error && (
        <div className="flex items-start gap-2 bg-danger-500/10 border border-danger-500/20 rounded-xl px-4 py-3 text-sm text-danger-600">
          <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
          <span className="font-mono text-xs break-all">{entry.error}</span>
        </div>
      )}
    </>
  );
}
