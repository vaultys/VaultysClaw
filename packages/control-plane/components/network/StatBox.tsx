import { cn } from "@/lib/utils";

export function StatBox({
  label,
  value,
  sub,
  disabled,
}: {
  label: string;
  value: string | number;
  sub?: string;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "border rounded-lg px-4 py-3 transition-opacity",
        disabled
          ? "bg-background border-neutral-200 opacity-40"
          : "bg-background border-neutral-200"
      )}
    >
      <div className="text-xs text-foreground-500 uppercase tracking-wide mb-1">
        {label}
      </div>
      <div className="text-xl font-bold text-foreground">{value}</div>
      {sub && <div className="text-xs text-foreground-400 mt-0.5">{sub}</div>}
    </div>
  );
}
