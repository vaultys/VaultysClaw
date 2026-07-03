"use client";

import { useState, useEffect } from "react";
import { Puzzle, AlertTriangle, BookOpen, Search, X } from "lucide-react";
import {
  userApi,
  unwrap,
} from "@/lib/api/ts-rest/client";
import type { LibrarySkill } from "@/lib/contracts";

export function BrowseLibraryModal({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (skill: LibrarySkill) => void;
}) {
  const [allSkills, setAllSkills] = useState<LibrarySkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [search, setSearch] = useState("");

  // Debounce search by 200 ms so filtering doesn't run on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setSearch(inputValue), 200);
    return () => clearTimeout(t);
  }, [inputValue]);

  useEffect(() => {
    userApi.skills
      .library()
      .then((res) => {
        const data = unwrap(res);
        // Deduplicate by name: keep the entry with the highest install count
        const best = new Map<string, LibrarySkill>();
        for (const s of data) {
          const existing = best.get(s.name);
          if (!existing || s.installs > existing.installs) best.set(s.name, s);
        }
        // Sort by installs descending once, at load time
        setAllSkills(
          Array.from(best.values()).sort((a, b) => b.installs - a.installs)
        );
      })
      .catch(() => setError("Failed to load skills library"))
      .finally(() => setLoading(false));
  }, []);

  const displayed = search.trim()
    ? allSkills.filter((s) => {
        const q = search.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.source.toLowerCase().includes(q)
        );
      })
    : allSkills;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-background-100 border border-neutral-200 rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 flex-shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary-400" />
            <h2 className="text-base font-semibold text-foreground">
              Org Skill Catalog
            </h2>
            {!loading && !error && (
              <span className="text-xs text-foreground-500">
                {displayed.length} of {allSkills.length}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-foreground-500 hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-neutral-200 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-foreground-500" />
            <input
              autoFocus
              className="w-full bg-background border border-neutral-200 rounded-lg pl-8 pr-3 py-2 text-sm text-foreground placeholder-foreground-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Search by name, description, or source…"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {loading && (
            <div className="flex justify-center py-12 text-foreground-500 text-sm">
              Loading skills library…
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 py-8 justify-center text-sm text-danger-500">
              <AlertTriangle className="w-4 h-4" />
              {error}
            </div>
          )}
          {!loading && !error && displayed.length === 0 && (
            <div className="text-center py-12 text-foreground-500 text-sm">
              No skills match your search
            </div>
          )}
          {!loading &&
            !error &&
            displayed.map((skill) => (
              <div
                key={skill.name}
                className="group flex items-start gap-3 p-3 rounded-xl border border-neutral-200 hover:border-primary-500/50 hover:bg-primary-500/5 transition-colors cursor-pointer"
                onClick={() => onSelect(skill)}
              >
                {skill.icon ? (
                  <span className="text-lg leading-none flex-shrink-0 mt-0.5">
                    {skill.icon}
                  </span>
                ) : (
                  <Puzzle className="w-4 h-4 text-primary-400 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-mono font-medium text-foreground">
                      {skill.name}
                    </span>
                    {skill.version && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-background border border-neutral-200 text-foreground-500 font-mono">
                        v{skill.version}
                      </span>
                    )}
                    {skill.contentType.hasInstructions && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-primary-100 border border-primary-300 text-primary-700">
                        instructions
                      </span>
                    )}
                  </div>
                  {skill.description && (
                    <p className="text-xs text-foreground-500 line-clamp-2">
                      {skill.description}
                    </p>
                  )}
                </div>
                <span className="flex-shrink-0 text-xs text-primary-400 opacity-0 group-hover:opacity-100 transition-opacity self-center">
                  Assign →
                </span>
              </div>
            ))}
        </div>

        <div className="px-5 py-3 border-t border-neutral-200 flex-shrink-0 text-xs text-foreground-500">
          Organisation skill catalog · Click a skill to assign it to a workspace.
        </div>
      </div>
    </div>
  );
}
