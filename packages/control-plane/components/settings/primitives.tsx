import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export function SectionHeader({
  icon: Icon,
  title,
}: {
  icon: React.ElementType;
  title: string;
}) {
  return (
    <div className="px-5 py-4 border-b border-neutral-200 flex items-center gap-2">
      <Icon className="w-4 h-4 text-foreground-500" />
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
    </div>
  );
}

export function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between items-start gap-4 py-2.5 border-b border-neutral-200/60 last:border-0">
      <span className="text-xs text-foreground-400 uppercase tracking-wider font-medium shrink-0 pt-0.5">
        {label}
      </span>
      <span
        className={cn(
          "text-sm text-right break-all",
          mono ? "font-mono text-xs text-foreground-700" : "text-foreground"
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="ml-1.5 text-foreground-400 hover:text-foreground transition shrink-0 align-middle inline-flex"
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-success-500" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
    </button>
  );
}
