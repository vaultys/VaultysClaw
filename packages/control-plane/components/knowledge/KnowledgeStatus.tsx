import { KnowledgeSource } from "@prisma/client";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Globe,
  FileText,
} from "lucide-react";
import { JSX } from "react/jsx-runtime";

export function StatusDot({ status }: { status: KnowledgeSource["status"] }) {
  const map: Record<KnowledgeSource["status"], string> = {
    idle: "bg-neutral-400",
    syncing: "bg-primary-500 animate-pulse",
    ready: "bg-success-500",
    error: "bg-danger-500",
  };
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${map[status] ?? map.idle}`}
    />
  );
}

export function StatusBadge({ status }: { status: KnowledgeSource["status"] }) {
  const map: Record<
    KnowledgeSource["status"],
    { icon: JSX.Element; label: string; cls: string }
  > = {
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
  const { icon, label, cls } = map[status] ?? map.idle;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${cls}`}
    >
      {icon} {label}
    </span>
  );
}

export function TypeIcon({ type }: { type: string }) {
  if (type === "url")
    return <Globe size={13} className="text-primary-400 shrink-0" />;
  return <FileText size={13} className="text-warning-400 shrink-0" />;
}
