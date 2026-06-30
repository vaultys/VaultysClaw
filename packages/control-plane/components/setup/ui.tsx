import React from "react";

export function Field({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <div>
      <label className="block text-xs text-foreground-500 mb-1.5">{label}</label>
      <input
        {...props}
        className="w-full bg-background-200 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 disabled:opacity-50"
      />
    </div>
  );
}

export function StepFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-3 pt-2 mt-1 border-t border-neutral-200">
      {children}
    </div>
  );
}
