"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ActorSearchOption {
  did: string;
  name: string;
  kind: string;
  workspaceName?: string | null;
}

const MAX_VISIBLE_RESULTS = 60;

function shortDid(did: string): string {
  if (did.length <= 26) return did;
  return `${did.slice(0, 14)}...${did.slice(-8)}`;
}

function actorLabel(actor: ActorSearchOption): string {
  return `${actor.name} (${actor.kind})`;
}

function searchableText(actor: ActorSearchOption): string {
  return [actor.name, actor.kind, actor.did, actor.workspaceName ?? ""].join(" ").toLowerCase();
}

export default function ActorSearchSelect({
  actors,
  name,
  defaultValue = "",
  required = false,
  placeholder = "Search actors by name, kind, or DID...",
  emptyLabel = "No actor selected",
  noResultsLabel = "No actors match your search.",
  onValueChange,
}: {
  actors: ActorSearchOption[];
  name: string;
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
  emptyLabel?: string;
  noResultsLabel?: string;
  onValueChange?: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [value, setValue] = useState(defaultValue);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedActor = useMemo(
    () => actors.find((actor) => actor.did === value) ?? null,
    [actors, value]
  );
  const hasUnlistedValue = value !== "" && !selectedActor;

  const filteredActors = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? actors.filter((actor) => searchableText(actor).includes(needle))
      : actors;
    return matches.slice(0, MAX_VISIBLE_RESULTS);
  }, [actors, query]);

  const totalMatches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? actors.filter((actor) => searchableText(actor).includes(needle)).length : actors.length;
  }, [actors, query]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        onClick={() => setOpen((next) => !next)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-background-200/40",
          !selectedActor && required ? "text-foreground-400" : "text-foreground"
        )}
      >
        <span className="min-w-0 flex-1">
          {selectedActor ? (
            <>
              <span className="block truncate font-medium">{actorLabel(selectedActor)}</span>
              <span className="mt-0.5 block truncate font-mono text-xs text-foreground-500">
                {selectedActor.workspaceName ? `${selectedActor.workspaceName} - ` : ""}
                {shortDid(selectedActor.did)}
              </span>
            </>
          ) : hasUnlistedValue ? (
            <>
              <span className="block truncate font-medium">Selected actor</span>
              <span className="mt-0.5 block truncate font-mono text-xs text-foreground-500">
                {shortDid(value)}
              </span>
            </>
          ) : (
            <span>{emptyLabel}</span>
          )}
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-foreground-400 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-neutral-200 bg-background-100 shadow-2xl shadow-black/20">
          <div className="border-b border-neutral-200/60 p-2">
            <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-background px-2.5 py-1.5">
              <Search className="h-4 w-4 shrink-0 text-foreground-400" />
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={placeholder}
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-400"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="rounded p-0.5 text-foreground-400 transition-colors hover:bg-background-200 hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto py-1" role="listbox">
            {!required && (
              <button
                type="button"
                onClick={() => {
                  setValue("");
                  onValueChange?.("");
                  setOpen(false);
                }}
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-foreground-600 transition-colors hover:bg-background-200/60"
                role="option"
                aria-selected={value === ""}
              >
                <span className="flex h-5 w-5 items-center justify-center">
                  {value === "" && <Check className="h-4 w-4 text-primary-600" />}
                </span>
                <span>{emptyLabel}</span>
              </button>
            )}

            {filteredActors.map((actor) => {
              const selected = actor.did === value;
              return (
                <button
                  key={actor.did}
                  type="button"
                  onClick={() => {
                    setValue(actor.did);
                    onValueChange?.(actor.did);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="flex w-full items-start gap-3 px-3 py-2 text-left transition-colors hover:bg-background-200/60"
                  role="option"
                  aria-selected={selected}
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                    {selected && <Check className="h-4 w-4 text-primary-600" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {actorLabel(actor)}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-xs text-foreground-500">
                      {actor.workspaceName ? `${actor.workspaceName} - ` : ""}
                      {actor.did}
                    </span>
                  </span>
                </button>
              );
            })}

            {filteredActors.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-foreground-400">
                {noResultsLabel}
              </div>
            )}
          </div>

          {totalMatches > MAX_VISIBLE_RESULTS && (
            <div className="border-t border-neutral-200/60 px-3 py-2 text-xs text-foreground-500">
              Showing first {MAX_VISIBLE_RESULTS} of {totalMatches} matches. Keep typing to narrow
              the list.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
