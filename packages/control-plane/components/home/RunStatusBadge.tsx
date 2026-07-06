const STATUS_MAP: Record<string, { cls: string; label: string }> = {
  running: { cls: "bg-primary-100 text-primary-700", label: "Running" },
  completed: { cls: "bg-success-100 text-success-700", label: "Done" },
  failed: { cls: "bg-danger-100 text-danger-700", label: "Failed" },
  pending: { cls: "bg-warning-100 text-warning-700", label: "Pending" },
};

export function RunStatusBadge({ status }: { status: string }) {
  const { cls, label } = STATUS_MAP[status] ?? {
    cls: "bg-background-200 text-foreground-500",
    label: status,
  };
  return (
    <span
      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}
    >
      {label}
    </span>
  );
}
