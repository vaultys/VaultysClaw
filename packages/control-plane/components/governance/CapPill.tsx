import { Zap } from "lucide-react";
import { CAPABILITY_ICONS } from "./constants";

export function CapPill({ cap, risky }: { cap: string; risky?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border font-normal
 ${
   risky
     ? "bg-danger-50 text-danger-600 border-danger-200"
     : "bg-background-200 text-foreground-400 border-neutral-200"
 }`}
    >
      {CAPABILITY_ICONS[cap] ?? <Zap size={11} />}
      {cap.replace(/_/g, " ")}
    </span>
  );
}
