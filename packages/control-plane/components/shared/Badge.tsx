import { ReactNode } from "react";
import {
  getStatusTailwindClass,
  getBadgeColorClass,
} from "@vaultysclaw/shared";

type BadgeType = "status" | "role" | "capability" | "badge";
type BadgeVariant = "success" | "error" | "warning" | "info" | "neutral";

interface BadgeProps {
  type?: BadgeType;
  value: string;
  variant?: BadgeVariant;
  className?: string;
  children?: ReactNode;
}

const TYPE_CLASSES = {
  status: "px-2 py-1 text-xs font-medium rounded-full",
  role: "px-2.5 py-0.5 text-xs font-semibold rounded",
  capability: "px-2 py-0.5 text-xs rounded border border-border-muted",
  badge: "px-2.5 py-1 text-xs font-medium rounded-md",
};

export function Badge({
  type = "badge",
  value,
  variant = "info",
  className = "",
  children,
}: BadgeProps) {
  let baseClass = TYPE_CLASSES[type];

  if (type === "status") {
    const colorClass = getStatusTailwindClass(value);
    return (
      <span className={`${baseClass} ${colorClass} ${className}`}>
        {children || value}
      </span>
    );
  }

  if (type === "role" || type === "badge") {
    const colorClass = getBadgeColorClass(variant);
    return (
      <span className={`${baseClass} ${colorClass} ${className}`}>
        {children || value}
      </span>
    );
  }

  // capability
  return (
    <span className={`${baseClass} bg-canvas text-fg-muted ${className}`}>
      {children || value}
    </span>
  );
}
