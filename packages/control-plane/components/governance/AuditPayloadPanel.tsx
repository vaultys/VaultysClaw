import { FileText } from "lucide-react";
import type { AuditEntryDetail, ToolExecutionDetails } from "@/lib/contracts";
import { JsonBlock } from "./JsonBlock";
import { ToolExecutionPanel } from "./ToolExecutionPanel";
import { formatAuditDate } from "./constants";

export function AuditPayloadPanel({ entry }: { entry: AuditEntryDetail }) {
  const isActivity = entry.source === "activity";

  return (
    <div className="bg-background-100 border border-neutral-200 rounded-xl p-5 space-y-4">
      <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <FileText size={14} className="text-foreground-500" /> Payload
      </h2>

      {/* Intent timing */}
      {!isActivity && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            { label: "Sent at", value: formatAuditDate(entry.sentAt) },
            {
              label: "Completed at",
              value: entry.completedAt
                ? formatAuditDate(entry.completedAt)
                : "—",
            },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="bg-background-200 border border-neutral-200 rounded-lg px-3 py-2"
            >
              <div className="text-foreground-400 uppercase text-[10px] mb-0.5">
                {label}
              </div>
              <div className="text-foreground">{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Structured tool_execution display */}
      {isActivity &&
        entry.event === "tool_execution" &&
        entry.detailsParsed !== null && (
          <ToolExecutionPanel
            details={entry.detailsParsed as ToolExecutionDetails}
          />
        )}

      {/* Params / details (generic) */}
      {entry.params !== null && (
        <JsonBlock value={entry.params} label="Intent params" />
      )}
      {entry.detailsParsed !== null &&
        isActivity &&
        entry.event !== "tool_execution" && (
          <JsonBlock value={entry.detailsParsed} label="Event details" />
        )}
      {entry.detailsParsed === null && entry.details && (
        <div>
          <p className="text-xs text-foreground-500 mb-1.5">Raw details</p>
          <pre className="bg-background border border-neutral-200 rounded-lg p-3 text-xs font-mono text-foreground-700 overflow-x-auto whitespace-pre-wrap break-all">
            {entry.details}
          </pre>
        </div>
      )}

      {/* Output */}
      {entry.output !== null && (
        <JsonBlock value={entry.output} label="Output" />
      )}

      {!entry.params &&
        !entry.details &&
        !entry.output &&
        entry.event !== "tool_execution" && (
          <p className="text-xs text-foreground-400 italic">
            No payload data recorded for this event.
          </p>
        )}
    </div>
  );
}
