export function StatCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  tone?: "ok" | "warn" | "danger" | "neutral";
}) {
  const toneClasses = {
    ok: "text-success-500",
    warn: "text-warning-500",
    danger: "text-danger-500",
    neutral: "text-primary-700",
  }[tone ?? "neutral"];

  return (
    <div className="bg-background-100 border border-neutral-200 rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-foreground-400 uppercase tracking-wider font-medium">
          {label}
        </span>
        <span className={toneClasses}>{icon}</span>
      </div>
      <p className={`text-2xl font-semibold ${toneClasses}`}>{value}</p>
      {sub && <p className="text-xs text-foreground-500">{sub}</p>}
    </div>
  );
}
