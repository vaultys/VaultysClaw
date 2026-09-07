"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { FileText, KeyRound, Radio, Search, Settings, Users, X } from "lucide-react";

export interface AdminCommandItem {
  id: string;
  label: string;
  subtitle?: string;
  href: string;
  group: "Navigate" | "Actors" | "Sensors" | "Certificates" | "Workspaces";
  keywords?: string[];
}

const GROUP_ICONS = {
  Navigate: Search,
  Actors: Users,
  Sensors: Radio,
  Certificates: KeyRound,
  Workspaces: FileText,
} satisfies Record<AdminCommandItem["group"], React.ElementType>;

const MAX_RESULTS = 80;

function haystack(item: AdminCommandItem): string {
  return [item.group, item.label, item.subtitle ?? "", ...(item.keywords ?? [])]
    .join(" ")
    .toLowerCase();
}

export default function AdminCommandPalette({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: AdminCommandItem[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = needle ? items.filter((item) => haystack(item).includes(needle)) : items;
    return matches.slice(0, MAX_RESULTS);
  }, [items, query]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange, open]);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      shouldFilter={false}
      label="Admin command menu"
      className="fixed inset-0 z-[100]"
    >
      <div className="fixed inset-0 bg-foreground/30" onClick={() => onOpenChange(false)} />
      <div className="fixed left-1/2 top-20 w-[min(720px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-neutral-200 bg-background-100 shadow-2xl shadow-black/30">
        <div className="flex items-center gap-3 border-b border-neutral-200/60 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-foreground-400" />
          <Command.Input
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Search admin, actors, sensors, certificates..."
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-400"
          />
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close command menu"
            className="rounded-md p-1 text-foreground-400 transition-colors hover:bg-background-200 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <Command.List className="max-h-[28rem] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-8 text-center text-sm text-foreground-400">
            No results found.
          </Command.Empty>
          {(["Navigate", "Actors", "Sensors", "Certificates", "Workspaces"] as const).map((group) => {
            const groupItems = visibleItems.filter((item) => item.group === group);
            if (groupItems.length === 0) return null;
            const Icon = GROUP_ICONS[group] ?? Settings;
            return (
              <Command.Group
                key={group}
                heading={group}
                className="pb-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-foreground-500"
              >
                {groupItems.map((item) => (
                  <Command.Item
                    key={item.id}
                    value={haystack(item)}
                    onSelect={() => {
                      onOpenChange(false);
                      router.push(item.href);
                    }}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground aria-selected:bg-background-200 aria-selected:text-foreground"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background-200/70 text-foreground-500">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{item.label}</span>
                      {item.subtitle && (
                        <span className="mt-0.5 block truncate text-xs text-foreground-500">
                          {item.subtitle}
                        </span>
                      )}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            );
          })}
          {items.length > MAX_RESULTS && visibleItems.length === MAX_RESULTS && (
            <div className="border-t border-neutral-200/60 px-3 py-2 text-xs text-foreground-500">
              Showing first {MAX_RESULTS} entries. Type a more specific query to narrow results.
            </div>
          )}
        </Command.List>
      </div>
    </Command.Dialog>
  );
}
