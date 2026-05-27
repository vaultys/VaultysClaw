"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Puzzle,
  Plus,
  Pencil,
  Trash2,
  Globe2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Shield,
  Users,
  Share2,
  BookOpen,
  Star,
  Download,
  Search,
  X,
  ExternalLink,
} from "lucide-react";
import { useRole } from "@/hooks/useRole";

interface SkillEntry {
  id: string;
  realm_id: string;
  realm_name: string;
  name: string;
  description: string | null;
  version: string | null;
  is_required: number;
  config: string;
  content: string | null;
  created_at: string;
  agent_count: number;
  override_count: number;
}

interface RealmOption {
  id: string;
  name: string;
}

type SkillGroup = { name: string; entries: SkillEntry[] };

function groupByName(rows: SkillEntry[]): SkillGroup[] {
  const map = new Map<string, SkillEntry[]>();
  for (const row of rows) {
    const list = map.get(row.name) ?? [];
    list.push(row);
    map.set(row.name, list);
  }
  return Array.from(map.entries()).map(([name, entries]) => ({ name, entries }));
}

// ---- Library types ----

interface LibrarySkill {
  id: string;
  name: string;
  description: string;
  source: string;
  skillId: string;
  installs: number;
  githubStars: number;
  repoUrl: string;
  standalone: boolean;
  icon?: string | null;
  version?: string;
  content?: string | null;
  contentType: {
    hasInstructions: boolean;
    hasScripts: boolean;
    hasReferences: boolean;
    hasAssets: boolean;
  };
}

// ---- Browse Library Modal ----

function BrowseLibraryModal({
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
    fetch("/api/skills/library")
      .then((r) => r.json())
      .then((data: unknown) => {
        if (!Array.isArray(data)) {
          setError((data as { error?: string }).error ?? "Unexpected response from library");
          return;
        }
        // Deduplicate by name: keep the entry with the highest install count
        const best = new Map<string, LibrarySkill>();
        for (const s of data as LibrarySkill[]) {
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

  function fmt(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
    return String(n);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-vc-surface border border-vc-border rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-vc-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-indigo-400" />
            <h2 className="text-base font-semibold text-vc-text">Org Skill Catalog</h2>
            {!loading && !error && (
              <span className="text-xs text-vc-muted">
                {displayed.length} of {allSkills.length}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-vc-muted hover:text-vc-text transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-vc-border flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-vc-muted" />
            <input
              autoFocus
              className="w-full bg-vc-bg border border-vc-border rounded-lg pl-8 pr-3 py-2 text-sm text-vc-text placeholder-vc-muted focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Search by name, description, or source…"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {loading && (
            <div className="flex justify-center py-12 text-vc-muted text-sm">Loading skills library…</div>
          )}
          {error && (
            <div className="flex items-center gap-2 py-8 justify-center text-sm text-red-500">
              <AlertTriangle className="w-4 h-4" />{error}
            </div>
          )}
          {!loading && !error && displayed.length === 0 && (
            <div className="text-center py-12 text-vc-muted text-sm">No skills match your search</div>
          )}
          {!loading && !error && displayed.map((skill) => (
            <div
              key={skill.name}
              className="group flex items-start gap-3 p-3 rounded-xl border border-vc-border hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-colors cursor-pointer"
              onClick={() => onSelect(skill)}
            >
              {skill.icon
                ? <span className="text-lg leading-none flex-shrink-0 mt-0.5">{skill.icon}</span>
                : <Puzzle className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
              }
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-mono font-medium text-vc-text">{skill.name}</span>
                  {skill.version && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-vc-bg border border-vc-border text-vc-muted font-mono">
                      v{skill.version}
                    </span>
                  )}
                  {skill.contentType.hasInstructions && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/30 border border-indigo-300 dark:border-indigo-800 text-indigo-700 dark:text-indigo-400">
                      instructions
                    </span>
                  )}
                </div>
                {skill.description && (
                  <p className="text-xs text-vc-muted line-clamp-2">{skill.description}</p>
                )}
              </div>
              <span className="flex-shrink-0 text-xs text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity self-center">
                Assign →
              </span>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-vc-border flex-shrink-0 text-xs text-vc-muted">
          Organisation skill catalog · Click a skill to assign it to a realm.
        </div>
      </div>
    </div>
  );
}

// ---- Share to Realm Modal ----

function ShareToRealmModal({
  group,
  realms,
  onClose,
  onCreated,
}: {
  group: SkillGroup;
  realms: RealmOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const source = group.entries[0];
  const existingRealmIds = new Set(group.entries.map((e) => e.realm_id));
  const available = realms.filter((r) => !existingRealmIds.has(r.id));

  const [realmId, setRealmId] = useState(available[0]?.id ?? "");
  const [isRequired, setIsRequired] = useState((source?.is_required ?? 0) === 1);
  const [configText, setConfigText] = useState(() => {
    try { return JSON.stringify(JSON.parse(source?.config ?? "{}"), null, 2); } catch { return "{}"; }
  });
  const [configError, setConfigError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function validateConfig(v: string) {
    try { JSON.parse(v); setConfigError(""); } catch { setConfigError("Invalid JSON"); }
  }

  if (available.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-vc-surface border border-vc-border rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
          <Share2 className="w-8 h-8 text-vc-muted mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium text-vc-text mb-1">Already in all realms</p>
          <p className="text-xs text-vc-muted mb-4">
            <span className="font-mono">{group.name}</span> is registered in every realm.
          </p>
          <button onClick={onClose} className="px-4 py-2 text-sm text-vc-muted border border-vc-border rounded-lg hover:text-vc-text transition-colors">
            Close
          </button>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!realmId) { setError("Select a realm"); return; }
    if (configError) { setError("Fix config JSON first"); return; }
    let config: Record<string, unknown> = {};
    try { config = JSON.parse(configText); } catch { setError("Invalid config JSON"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          realmId,
          name: group.name,
          description: source?.description ?? undefined,
          version: source?.version ?? undefined,
          isRequired,
          config,
          content: source?.content ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to add skill"); setSaving(false); return; }
      onCreated();
      onClose();
    } catch {
      setError("Network error");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-vc-surface border border-vc-border rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-base font-semibold text-vc-text mb-1">Share skill to realm</h2>
        <p className="text-xs text-vc-muted mb-4">
          Adding <span className="font-mono font-medium text-vc-text">{group.name}</span> to an additional realm.
          The skill's name{source?.content ? ", description, and instructions" : " and description"} will be copied from the existing entry.
        </p>

        {/* Existing realms context */}
        <div className="flex flex-wrap gap-1 mb-4">
          <span className="text-xs text-vc-muted">Already in:</span>
          {group.entries.map((e) => (
            <span key={e.id} className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-vc-bg border border-vc-border text-vc-muted">
              <Globe2 className="w-3 h-3" />{e.realm_name}
            </span>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-vc-muted mb-1">Target realm <span className="text-red-500">*</span></label>
            <select
              className="w-full bg-vc-bg border border-vc-border rounded-lg px-3 py-2 text-sm text-vc-text focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={realmId}
              onChange={(e) => setRealmId(e.target.value)}
            >
              {available.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="shareRequired"
              className="rounded border-vc-border text-indigo-600 focus:ring-indigo-500"
              checked={isRequired}
              onChange={(e) => setIsRequired(e.target.checked)}
            />
            <label htmlFor="shareRequired" className="text-sm text-vc-text">
              Required in this realm — agents cannot disable
            </label>
          </div>
          <div>
            <label className="block text-xs font-medium text-vc-muted mb-1">
              Config (JSON) <span className="font-normal text-vc-muted">— realm-specific overrides</span>
            </label>
            <textarea
              className={`w-full bg-vc-bg border rounded-lg px-3 py-2 text-xs font-mono text-vc-text focus:outline-none focus:ring-2 focus:ring-indigo-500 h-24 resize-none ${configError ? "border-red-500" : "border-vc-border"}`}
              placeholder="{}"
              value={configText}
              onChange={(e) => { setConfigText(e.target.value); validateConfig(e.target.value); }}
            />
            {configError && <p className="text-xs text-red-500 mt-1">{configError}</p>}
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-vc-muted hover:text-vc-text rounded-lg border border-vc-border transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg disabled:opacity-50 transition-colors">
              {saving ? "Adding…" : "Add to realm"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---- Add Skill Modal ----

function AddSkillModal({
  realms,
  prefillName = "",
  prefillDescription = "",
  prefillContent = "",
  onClose,
  onCreated,
}: {
  realms: RealmOption[];
  prefillName?: string;
  prefillDescription?: string;
  prefillContent?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [realmId, setRealmId] = useState(realms[0]?.id ?? "");
  const [name, setName] = useState(prefillName);
  const [description, setDescription] = useState(prefillDescription);
  const [content, setContent] = useState(prefillContent);
  const [version, setVersion] = useState("");
  const [isRequired, setIsRequired] = useState(false);
  const [configText, setConfigText] = useState("{}");
  const [configError, setConfigError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const nameLocked = prefillName.length > 0;

  function validateConfig(v: string) {
    try { JSON.parse(v); setConfigError(""); } catch { setConfigError("Invalid JSON"); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Name is required"); return; }
    if (configError) { setError("Fix config JSON first"); return; }
    let config: Record<string, unknown> = {};
    try { config = JSON.parse(configText); } catch { setError("Invalid config JSON"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ realmId, name, description, version, isRequired, config, content: content || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to create skill"); setSaving(false); return; }
      onCreated();
      onClose();
    } catch {
      setError("Network error");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-vc-surface border border-vc-border rounded-2xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-base font-semibold text-vc-text mb-1">
          {nameLocked ? `Add "${prefillName}" to Another Realm` : "Add Skill to Realm"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Library context block */}
          {nameLocked && prefillDescription && (
            <div className="rounded-lg bg-indigo-500/5 border border-indigo-500/20 px-3 py-2.5">
              <p className="text-xs font-medium text-indigo-400 mb-1">From skills library</p>
              <p className="text-xs text-vc-muted leading-relaxed">{prefillDescription}</p>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-vc-muted mb-1">Realm</label>
            <select
              className="w-full bg-vc-bg border border-vc-border rounded-lg px-3 py-2 text-sm text-vc-text focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={realmId}
              onChange={(e) => setRealmId(e.target.value)}
            >
              {realms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-vc-muted mb-1">
              Skill name <span className="text-red-500">*</span>
            </label>
            <input
              className={`w-full bg-vc-bg border border-vc-border rounded-lg px-3 py-2 text-sm text-vc-text placeholder-vc-muted focus:outline-none focus:ring-2 focus:ring-indigo-500 ${nameLocked ? "opacity-60 cursor-not-allowed" : ""}`}
              placeholder="e.g. calculator"
              value={name}
              readOnly={nameLocked}
              onChange={(e) => !nameLocked && setName(e.target.value)}
            />
            <p className="text-xs text-vc-muted mt-1">
              {nameLocked
                ? "Name is from the library — must match the skill module filename on the agent"
                : "Must match the skill module name on the agent filesystem"}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-vc-muted mb-1">Short description</label>
              <input
                className="w-full bg-vc-bg border border-vc-border rounded-lg px-3 py-2 text-sm text-vc-text placeholder-vc-muted focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Optional summary"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-vc-muted mb-1">Version</label>
              <input
                className="w-full bg-vc-bg border border-vc-border rounded-lg px-3 py-2 text-sm text-vc-text placeholder-vc-muted focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. 1.0.0"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="addIsRequired"
              className="rounded border-vc-border text-indigo-600 focus:ring-indigo-500"
              checked={isRequired}
              onChange={(e) => setIsRequired(e.target.checked)}
            />
            <label htmlFor="addIsRequired" className="text-sm text-vc-text">
              Required — agents cannot disable this skill
            </label>
          </div>
          <div>
            <label className="block text-xs font-medium text-vc-muted mb-1">
              Config (JSON)
              <span className="ml-1 font-normal text-vc-muted">— skill-specific settings pushed to the agent</span>
            </label>
            <textarea
              className={`w-full bg-vc-bg border rounded-lg px-3 py-2 text-xs font-mono text-vc-text focus:outline-none focus:ring-2 focus:ring-indigo-500 h-24 resize-none ${configError ? "border-red-500" : "border-vc-border"}`}
              placeholder={'{\n  "apiKey": "...",\n  "maxResults": 10\n}'}
              value={configText}
              onChange={(e) => { setConfigText(e.target.value); validateConfig(e.target.value); }}
            />
            {configError && <p className="text-xs text-red-500 mt-1">{configError}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-vc-muted mb-1">
              Instructions (Markdown)
              <span className="ml-1 font-normal text-vc-muted">— injected into the agent's system prompt</span>
            </label>
            <textarea
              className="w-full bg-vc-bg border border-vc-border rounded-lg px-3 py-2 text-xs font-mono text-vc-text focus:outline-none focus:ring-2 focus:ring-indigo-500 h-40 resize-y"
              placeholder={"# My Skill\n\nDescribe what the agent should do when this skill is active…"}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-vc-muted hover:text-vc-text rounded-lg border border-vc-border hover:border-vc-text transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving ? "Adding…" : "Add Skill"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---- Edit Skill Modal ----

function EditSkillModal({
  entry,
  onClose,
  onSaved,
}: {
  entry: SkillEntry;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [description, setDescription] = useState(entry.description ?? "");
  const [version, setVersion] = useState(entry.version ?? "");
  const [isRequired, setIsRequired] = useState(entry.is_required === 1);
  const [content, setContent] = useState(entry.content ?? "");
  const [fetching, setFetching] = useState(false);
  const [configText, setConfigText] = useState(() => {
    try { return JSON.stringify(JSON.parse(entry.config), null, 2); } catch { return entry.config; }
  });
  const [configError, setConfigError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function fetchContent() {
    setFetching(true);
    try {
      const res = await fetch(`/api/skills/library/content?source=${encodeURIComponent(entry.name)}&skillId=${encodeURIComponent(entry.name)}`);
      // The source is not stored on entry — we can only try by name as skillId
      if (res.ok) {
        const data = await res.json();
        if (data.content) setContent(data.content);
      }
    } finally {
      setFetching(false);
    }
  }

  function validateConfig(v: string) {
    try { JSON.parse(v); setConfigError(""); } catch { setConfigError("Invalid JSON"); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (configError) { setError("Fix config JSON first"); return; }
    let config: Record<string, unknown> = {};
    try { config = JSON.parse(configText); } catch { setError("Invalid config JSON"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/realms/${entry.realm_id}/skills/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description || null, version: version || null, isRequired, config, content: content || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to update skill"); setSaving(false); return; }
      onSaved();
      onClose();
    } catch {
      setError("Network error");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-vc-surface border border-vc-border rounded-2xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-base font-semibold text-vc-text mb-1">Edit Skill</h2>
        <p className="text-xs text-vc-muted mb-4">
          <span className="font-mono font-medium text-vc-text">{entry.name}</span> in{" "}
          <span className="font-medium text-vc-text">{entry.realm_name}</span>
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-vc-muted mb-1">Description</label>
              <input
                className="w-full bg-vc-bg border border-vc-border rounded-lg px-3 py-2 text-sm text-vc-text placeholder-vc-muted focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-vc-muted mb-1">Version</label>
              <input
                className="w-full bg-vc-bg border border-vc-border rounded-lg px-3 py-2 text-sm text-vc-text placeholder-vc-muted focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="editRequired"
              className="rounded border-vc-border text-indigo-600 focus:ring-indigo-500"
              checked={isRequired}
              onChange={(e) => setIsRequired(e.target.checked)}
            />
            <label htmlFor="editRequired" className="text-sm text-vc-text">
              Required — agents cannot disable this skill
            </label>
          </div>
          <div>
            <label className="block text-xs font-medium text-vc-muted mb-1">Config (JSON)</label>
            <textarea
              className={`w-full bg-vc-bg border rounded-lg px-3 py-2 text-xs font-mono text-vc-text focus:outline-none focus:ring-2 focus:ring-indigo-500 h-28 resize-none ${configError ? "border-red-500" : "border-vc-border"}`}
              value={configText}
              onChange={(e) => { setConfigText(e.target.value); validateConfig(e.target.value); }}
            />
            {configError && <p className="text-xs text-red-500 mt-1">{configError}</p>}
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-vc-muted">
                Instructions (Markdown)
                <span className="ml-1 font-normal text-vc-muted">— injected into the agent's system prompt</span>
              </label>
            </div>
            <textarea
              className="w-full bg-vc-bg border border-vc-border rounded-lg px-3 py-2 text-xs font-mono text-vc-text focus:outline-none focus:ring-2 focus:ring-indigo-500 h-48 resize-y"
              placeholder={"# Skill Name\n\nDescribe what the agent should do when this skill is active…"}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <button
              type="button"
              onClick={fetchContent}
              disabled={fetching}
              className="mt-1 text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
            >
              {fetching ? "Fetching from library…" : "Re-fetch from skills library"}
            </button>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-vc-muted hover:text-vc-text rounded-lg border border-vc-border hover:border-vc-text transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---- Skill group card ----

function SkillGroupCard({
  group,
  onEdit,
  onDelete,
  onAddToRealm,
}: {
  group: SkillGroup;
  onEdit: (entry: SkillEntry) => void;
  onDelete: (entry: SkillEntry) => void;
  onAddToRealm: (group: SkillGroup) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const isShared = group.entries.length > 1;

  return (
    <div className="bg-vc-surface border border-vc-border rounded-xl overflow-hidden">
      {/* Card header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-vc-bg/50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-vc-muted">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
        <Puzzle className="w-4 h-4 text-indigo-400 flex-shrink-0" />
        <span className="font-mono text-sm font-semibold text-vc-text">{group.name}</span>
        {isShared && (
          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-800">
            <Share2 className="w-3 h-3" />
            shared · {group.entries.length} realms
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {/* Realm badges */}
          <div className="flex gap-1">
            {group.entries.map((e) => (
              <span
                key={e.id}
                className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-vc-bg border border-vc-border text-vc-muted"
              >
                <Globe2 className="w-3 h-3" />
                {e.realm_name}
              </span>
            ))}
          </div>
          <button
            onClick={(ev) => { ev.stopPropagation(); onAddToRealm(group); }}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-dashed border-indigo-500/50 text-indigo-400 hover:bg-indigo-500/10 transition-colors"
          >
            <Plus className="w-3 h-3" /> Add to realm
          </button>
        </div>
      </div>

      {/* Expanded per-realm detail */}
      {expanded && (
        <div className="border-t border-vc-border divide-y divide-vc-border">
          {group.entries.map((entry) => (
            <div key={entry.id} className="px-4 py-3 flex items-start gap-4">
              {/* Realm label */}
              <div className="w-36 flex-shrink-0 pt-0.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-vc-text">
                  <Globe2 className="w-3.5 h-3.5 text-vc-muted" />
                  {entry.realm_name}
                </div>
              </div>

              {/* Meta */}
              <div className="flex-1 min-w-0">
                {entry.description && (
                  <p className="text-xs text-vc-muted truncate mb-1.5">{entry.description}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {entry.version && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-vc-bg border border-vc-border text-vc-muted font-mono">
                      v{entry.version}
                    </span>
                  )}
                  {entry.is_required === 1 && (
                    <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400">
                      <Shield className="w-3 h-3" /> Required
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-xs text-vc-muted">
                    <Users className="w-3 h-3" />
                    {entry.agent_count} agent{entry.agent_count !== 1 ? "s" : ""}
                    {entry.override_count > 0 && `, ${entry.override_count} override${entry.override_count !== 1 ? "s" : ""}`}
                  </span>
                  {entry.content ? (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/30 border border-indigo-300 dark:border-indigo-800 text-indigo-700 dark:text-indigo-400">
                      instructions
                    </span>
                  ) : (
                    <span className="text-xs text-vc-muted/50">no instructions</span>
                  )}
                </div>
              </div>

              {/* Config preview */}
              {entry.config && entry.config !== "{}" && (
                <div className="w-40 flex-shrink-0">
                  <pre className="text-xs font-mono text-vc-muted bg-vc-bg border border-vc-border rounded px-2 py-1 overflow-hidden whitespace-nowrap text-ellipsis">
                    {entry.config}
                  </pre>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => onEdit(entry)}
                  className="p-1.5 rounded hover:bg-vc-bg text-vc-muted hover:text-vc-text transition-colors"
                  title="Edit"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onDelete(entry)}
                  className="p-1.5 rounded hover:bg-red-500/10 text-vc-muted hover:text-red-500 transition-colors"
                  title="Remove from realm"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Main page ----

export default function SkillsPage() {
  const router = useRouter();
  const { isGlobalAdmin, isLoading } = useRole();

  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [realms, setRealms] = useState<RealmOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState<{ open: boolean; prefillName: string; prefillDescription: string; prefillContent: string }>({ open: false, prefillName: "", prefillDescription: "", prefillContent: "" });
  const [showLibrary, setShowLibrary] = useState(false);
  const [shareGroup, setShareGroup] = useState<SkillGroup | null>(null);
  const [editEntry, setEditEntry] = useState<SkillEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<SkillEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 200);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!isLoading && !isGlobalAdmin) router.replace("/");
  }, [isLoading, isGlobalAdmin, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sk, rm] = await Promise.all([
        fetch("/api/skills").then((r) => r.json()),
        fetch("/api/realms").then((r) => r.json()),
      ]);
      setSkills(Array.isArray(sk) ? sk : []);
      const realmList: { id: string; name: string }[] = Array.isArray(rm)
        ? rm
        : Array.isArray(rm?.realms)
          ? rm.realms
          : [];
      setRealms(realmList.map((r) => ({ id: r.id, name: r.name })));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoading && isGlobalAdmin) load();
  }, [isLoading, isGlobalAdmin, load]);

  async function handleDelete(entry: SkillEntry) {
    setDeleting(true);
    try {
      await fetch(`/api/realms/${entry.realm_id}/skills/${entry.id}`, { method: "DELETE" });
      await load();
    } finally {
      setDeleting(false);
      setDeleteEntry(null);
    }
  }

  if (isLoading || !isGlobalAdmin) return null;

  const filtered = search.trim()
    ? skills.filter(
      (s) =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.realm_name.toLowerCase().includes(search.toLowerCase())
    )
    : skills;

  const groups = groupByName(filtered);
  const uniqueNames = new Set(skills.map((s) => s.name)).size;
  const realmsWithSkills = new Set(skills.map((s) => s.realm_id)).size;
  const sharedCount = Array.from(new Map(skills.map((s) => [s.name, 0])).keys()).filter(
    (name) => skills.filter((s) => s.name === name).length > 1
  ).length;

  return (
    <div className="p-6 w-full max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 flex items-center justify-center">
            <Puzzle className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-vc-text">Skills</h1>
            <p className="text-xs text-vc-muted">Manage skill registrations and realm sharing</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLibrary(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-vc-text bg-vc-surface hover:bg-vc-bg border border-vc-border rounded-lg transition-colors"
          >
            <BookOpen className="w-4 h-4 text-indigo-400" /> Org Catalog
          </button>
          <button
            onClick={() => setAddModal({ open: true, prefillName: "", prefillDescription: "", prefillContent: "" })}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Skill
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total entries", value: skills.length },
          { label: "Unique skills", value: uniqueNames },
          { label: "Realms with skills", value: realmsWithSkills },
          { label: "Shared across realms", value: sharedCount },
        ].map(({ label, value }) => (
          <div key={label} className="bg-vc-surface border border-vc-border rounded-xl px-4 py-3">
            <p className="text-2xl font-bold text-vc-text">{value}</p>
            <p className="text-xs text-vc-muted mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          className="w-full max-w-sm bg-vc-surface border border-vc-border rounded-lg px-3 py-2 text-sm text-vc-text placeholder-vc-muted focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Search skills or realms…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </div>

      {/* Skill groups */}
      {loading ? (
        <div className="flex justify-center py-16 text-vc-muted text-sm">Loading…</div>
      ) : groups.length === 0 ? (
        <div className="text-center py-16 text-vc-muted">
          <Puzzle className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{search ? "No skills match your search" : "No skills registered yet"}</p>
          {!search && (
            <div className="mt-3 flex items-center justify-center gap-3">
              <button
                onClick={() => setShowLibrary(true)}
                className="text-sm text-indigo-400 hover:text-indigo-300 underline"
              >
                Browse library
              </button>
              <span className="text-vc-muted text-xs">or</span>
              <button
                onClick={() => setAddModal({ open: true, prefillName: "", prefillDescription: "", prefillContent: "" })}
                className="text-sm text-indigo-400 hover:text-indigo-300 underline"
              >
                add manually
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <SkillGroupCard
              key={group.name}
              group={group}
              onEdit={setEditEntry}
              onDelete={setDeleteEntry}
              onAddToRealm={(g) => setShareGroup(g)}
            />
          ))}
        </div>
      )}

      {/* Library browser */}
      {showLibrary && (
        <BrowseLibraryModal
          onClose={() => setShowLibrary(false)}
          onSelect={(skill) => {
            // Content is already included in the catalog response — no extra fetch needed
            setAddModal({
              open: true,
              prefillName: skill.name,
              prefillDescription: skill.description,
              prefillContent: skill.content ?? "",
            });
          }}
        />
      )}

      {/* Share to realm modal */}
      {shareGroup && (
        <ShareToRealmModal
          group={shareGroup}
          realms={realms}
          onClose={() => setShareGroup(null)}
          onCreated={load}
        />
      )}

      {/* Add modal */}
      {addModal.open && realms.length > 0 && (
        <AddSkillModal
          realms={realms}
          prefillName={addModal.prefillName}
          prefillDescription={addModal.prefillDescription}
          prefillContent={addModal.prefillContent}
          onClose={() => setAddModal({ open: false, prefillName: "", prefillDescription: "", prefillContent: "" })}
          onCreated={load}
        />
      )}
      {addModal.open && realms.length === 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-vc-surface border border-vc-border rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
            <p className="text-sm text-vc-text mb-4">
              No realms exist yet. Create a realm before adding skills.
            </p>
            <button
              onClick={() => setAddModal({ open: false, prefillName: "", prefillDescription: "", prefillContent: "" })}
              className="px-4 py-2 text-sm text-vc-muted border border-vc-border rounded-lg hover:text-vc-text transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editEntry && (
        <EditSkillModal entry={editEntry} onClose={() => setEditEntry(null)} onSaved={load} />
      )}

      {/* Delete confirm */}
      {deleteEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-vc-surface border border-vc-border rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-vc-text">Remove skill from realm?</h3>
                <p className="text-xs text-vc-muted mt-1">
                  <span className="font-mono font-medium text-vc-text">{deleteEntry.name}</span> will be
                  removed from <span className="font-medium text-vc-text">{deleteEntry.realm_name}</span>.
                  All agent overrides for this entry will be deleted and agents will be notified.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteEntry(null)}
                className="px-4 py-2 text-sm text-vc-muted border border-vc-border rounded-lg hover:text-vc-text transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteEntry)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg disabled:opacity-50 transition-colors"
              >
                {deleting ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
