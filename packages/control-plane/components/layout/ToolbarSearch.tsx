"use client";

import { useEffect, useRef, useState } from "react";
import { Search, ChevronUp, ChevronDown, X, Check } from "lucide-react";
import type { ToolbarSearchConfig } from "./ToolbarContext";

/**
 * Odoo-style advanced search bar: removable filter chips + a text input, with
 * an expandable panel of filter-group columns. Driven entirely by the
 * `ToolbarSearchConfig` the page provides via `useToolbar`.
 */
export default function ToolbarSearch({
  search,
}: {
  search: ToolbarSearchConfig;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { value, onChange, placeholder, chips = [], filterGroups = [] } = search;
  const hasPanel = filterGroups.length > 0;

  // Close the panel on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={containerRef} className="relative w-full max-w-2xl">
      {/* Search bar */}
      <div className="flex items-center gap-1.5 bg-background-100 border border-neutral-200 rounded-lg pl-2.5 pr-1 py-1 focus-within:ring-2 focus-within:ring-primary-500 transition">
        <Search className="w-4 h-4 text-foreground-400 shrink-0" />

        {/* Active filter chips */}
        {chips.map((chip) => (
          <span
            key={chip.id}
            className="flex items-center gap-1 text-xs bg-primary-100 text-primary-700 border border-primary-300 rounded px-1.5 py-0.5 whitespace-nowrap"
          >
            {chip.label}
            <button
              onClick={chip.onRemove}
              className="hover:text-primary-900 transition-colors"
              aria-label="Remove filter"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}

        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "Search…"}
          className="flex-1 min-w-[80px] bg-transparent text-sm text-foreground placeholder:text-foreground-400 focus:outline-none px-1 py-0.5"
        />

        {hasPanel && (
          <button
            onClick={() => setOpen((o) => !o)}
            className="p-1 rounded text-foreground-500 hover:text-foreground hover:bg-background-200 transition-colors shrink-0"
            aria-label="Toggle filters"
          >
            {open ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        )}
      </div>

      {/* Filter panel */}
      {open && hasPanel && (
        <div className="absolute top-full left-0 mt-1.5 w-full min-w-[640px] bg-background-100 border border-neutral-200 rounded-xl shadow-2xl shadow-black/30 z-50 p-4">
          <div className="flex gap-6">
            {filterGroups.map((group) => (
              <div
                key={group.id}
                className="flex-1 min-w-[180px] space-y-1"
              >
                <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground mb-2">
                  {group.icon}
                  {group.label}
                </div>
                {group.options.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={opt.onToggle}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left transition-colors ${
                      opt.active
                        ? "text-primary-700 bg-primary-50 dark:bg-primary-900/20"
                        : "text-foreground-700 hover:bg-background-200"
                    }`}
                  >
                    <span className="w-3.5 flex justify-center shrink-0">
                      {opt.active && <Check className="w-3.5 h-3.5" />}
                    </span>
                    {opt.icon && (
                      <span className="text-foreground-400">{opt.icon}</span>
                    )}
                    <span className="flex-1">{opt.label}</span>
                  </button>
                ))}
                {group.onClear && (
                  <button
                    onClick={group.onClear}
                    className="w-full text-left text-xs text-primary-500 hover:text-primary-400 px-2 py-1 mt-1 border-t border-neutral-200 pt-2"
                  >
                    Clear
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
