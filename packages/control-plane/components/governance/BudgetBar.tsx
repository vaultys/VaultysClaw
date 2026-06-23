import { formatCompactNumber } from "@vaultysclaw/shared";

export function BudgetBar({
  used,
  budget,
  label,
}: {
  used: number;
  budget: number;
  label: string;
}) {
  const pct = Math.min(100, Math.round((used / budget) * 100));
  const tone =
    pct >= 100
      ? "bg-danger-500"
      : pct >= 80
        ? "bg-warning-500"
        : "bg-primary-500";
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs text-foreground-500">
        <span>{label}</span>
        <span>
          {formatCompactNumber(used)} / {formatCompactNumber(budget)} ({pct}%)
        </span>
      </div>
      <div className="h-1.5 bg-background-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${tone} rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
