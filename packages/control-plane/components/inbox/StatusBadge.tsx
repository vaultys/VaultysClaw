"use client";

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    pending: {
      label: "Pending",
      className: "bg-warning-100 text-warning-700",
    },
    notified: {
      label: "Notified",
      className: "bg-primary-100 text-primary-700",
    },
    approved: {
      label: "Approved",
      className: "bg-success-100 text-success-700",
    },
    rejected: {
      label: "Rejected",
      className: "bg-danger-100 text-danger-700",
    },
    dismissed: {
      label: "Dismissed",
      className: "bg-background-200 text-foreground-500",
    },
  };
  const s = map[status] ?? {
    label: status,
    className: "bg-background-200 text-foreground-500",
  };
  return (
    <span
      className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.className}`}
    >
      {s.label}
    </span>
  );
}
