"use client";

export function TokenBar({
  used,
  budget,
  label,
}: {
  used: number;
  budget: number | null;
  label: string;
}) {
  const pct = budget ? Math.min(100, Math.round((used / budget) * 100)) : null;
  const danger = pct !== null && pct >= 90;
  const warn = pct !== null && pct >= 70 && !danger;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-foreground-500">{label}</span>
        <span
          className={`font-mono ${danger ? "text-danger-600" : warn ? "text-warning-600" : "text-foreground"}`}
        >
          {used.toLocaleString()}
          {budget ? ` / ${budget.toLocaleString()}` : ""}
        </span>
      </div>
      {budget && (
        <div className="h-1.5 bg-background-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${danger ? "bg-danger-500" : warn ? "bg-warning-500" : "bg-primary-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}
