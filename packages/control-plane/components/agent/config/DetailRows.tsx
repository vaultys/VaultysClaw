import type { ReactNode } from "react";

export interface DetailRow {
  label: string;
  value: ReactNode;
}

/** Label/value rows shared by the agent-key and manual-config view modes. */
export function DetailRows({ rows }: { rows: DetailRow[] }) {
  return (
    <>
      {rows.map(({ label, value }) => (
        <div key={label} className="flex items-start gap-4 px-4 py-3">
          <div className="w-28 flex-shrink-0 text-xs text-foreground-500 uppercase pt-0.5">
            {label}
          </div>
          <div className="flex-1 text-sm text-foreground">{value}</div>
        </div>
      ))}
    </>
  );
}
