import { KnowledgeSource } from "@prisma/client";
import { Clock, Loader2, CheckCircle2, XCircle } from "lucide-react";

export function KsStatusBadge({
  status,
}: {
  status: KnowledgeSource["status"];
}) {
  const map = {
    idle: {
      icon: <Clock size={12} />,
      label: "Idle",
      cls: "bg-neutral-100 text-neutral-500 border-neutral-300",
    },
    syncing: {
      icon: <Loader2 size={12} className="animate-spin" />,
      label: "Syncing",
      cls: "bg-primary-100 text-primary-700 border-primary-300",
    },
    ready: {
      icon: <CheckCircle2 size={12} />,
      label: "Ready",
      cls: "bg-success-100 text-success-700 border-success-300",
    },
    error: {
      icon: <XCircle size={12} />,
      label: "Error",
      cls: "bg-danger-100 text-danger-700 border-danger-300",
    },
  };
  const { icon, label, cls } = map[status as keyof typeof map] ?? map.idle;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${cls}`}
    >
      {icon} {label}
    </span>
  );
}
