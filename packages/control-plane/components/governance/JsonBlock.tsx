import { useState } from "react";

export function JsonBlock({ value, label }: { value: unknown; label: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const json = JSON.stringify(value, null, 2);
  return (
    <div className="space-y-1.5">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1.5 text-xs text-foreground-500 hover:text-foreground transition-colors"
      >
        <span
          className={`transition-transform ${collapsed ? "-rotate-90" : ""}`}
        >
          ▾
        </span>
        {label}
      </button>
      {!collapsed && (
        <pre className="bg-background border border-neutral-200 rounded-lg p-4 text-xs font-mono text-foreground-700 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
          {json}
        </pre>
      )}
    </div>
  );
}
