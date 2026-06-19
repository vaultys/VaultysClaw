"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Globe2, Plus, Star, Trash2, Users, Bot, GitFork } from "lucide-react";
import { useRole } from "@/hooks/useRole";

interface Realm {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  isDefault: number;
  default_capabilities: string;
  createdAt: string;
  agentCount?: number;
  userCount?: number;
  workflowCount?: number;
}

const PRESET_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#06b6d4",
];

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function CreateRealmModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const slug = slugify(name);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/realms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug,
          description: description.trim(),
          color,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create realm");
        setSaving(false);
        return;
      }
      onCreated();
      onClose();
    } catch {
      setError("Network error");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-background-100 border border-neutral-200 rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-base font-semibold text-foreground mb-4">
          Create Realm
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-foreground-500 mb-1">
              Name
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-background border border-neutral-200 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Engineering, Sales, EU Office…"
            />
            {name && (
              <p className="text-foreground-400 text-xs mt-1">
                slug: <code className="font-mono">{slug}</code>
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm text-foreground-500 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full bg-background border border-neutral-200 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              placeholder="Optional description"
            />
          </div>
          <div>
            <label className="block text-sm text-foreground-500 mb-2">
              Accent color
            </label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? "white" : "transparent",
                    boxShadow: color === c ? `0 0 0 2px ${c}` : "none",
                  }}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-7 h-7 rounded-full border border-neutral-200 cursor-pointer bg-transparent"
                title="Custom color"
              />
            </div>
          </div>
          {error && (
            <p className="text-danger-600 text-sm">
              {error}
            </p>
          )}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-xl border border-neutral-200 text-foreground-500 text-sm hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {saving ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function RealmsPage() {
  const router = useRouter();
  const { isGlobalAdmin } = useRole();
  const [realms, setRealms] = useState<Realm[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/realms");
    const data = (await res.json()) as { realms: Realm[] };
    setRealms(data.realms ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSetDefault(id: string) {
    await fetch(`/api/realms/${id}/default`, { method: "POST" });
    load();
  }

  async function handleDelete(id: string) {
    if (
      !confirm(
        "Delete this realm? Members will be removed from it. This cannot be undone."
      )
    )
      return;
    setDeletingId(id);
    await fetch(`/api/realms/${id}`, { method: "DELETE" });
    setDeletingId(null);
    load();
  }

  return (
    <div className="p-6 w-full max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Realms</h1>
          <p className="text-foreground-500 text-sm mt-0.5">
            {loading
              ? "Loading…"
              : `${realms.length} realm${realms.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        {isGlobalAdmin && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white font-medium px-4 py-2 rounded-xl text-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Realm
          </button>
        )}
      </div>

      {/* Realm cards grid */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : realms.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <Globe2 className="w-10 h-10 text-neutral-300 mb-3" />
          <p className="text-foreground-500">No realms yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {realms.map((realm) => (
            <div
              key={realm.id}
              onClick={() => router.push(`/realms/${realm.id}`)}
              className="bg-background-100 border border-neutral-200 rounded-2xl overflow-clip p-5 cursor-pointer hover:border-primary-500/50 transition-all group relative"
            >
              {/* Color accent strip */}
              <div
                className="absolute top-0 left-0 right-0 h-2"
                style={{ backgroundColor: realm.color }}
              />

              <div className="flex items-start justify-between mb-3 mt-1">
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: realm.color + "22",
                      border: `1px solid ${realm.color}44`,
                    }}
                  >
                    <Globe2
                      className="w-4 h-4"
                      style={{ color: realm.color }}
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-foreground text-sm">
                        {realm.name}
                      </span>
                      {realm.isDefault === 1 && (
                        <span className="text-xs px-1.5 py-0.5 rounded-md bg-warning-50 text-warning-700 font-medium">
                          default
                        </span>
                      )}
                    </div>
                    <code className="text-xs text-foreground-400 font-mono">
                      {realm.slug}
                    </code>
                  </div>
                </div>
              </div>

              {realm.description && (
                <p className="text-foreground-500 text-xs mb-3 line-clamp-2">
                  {realm.description}
                </p>
              )}

              {/* Member counts */}
              <div className="flex items-center gap-3 mb-3">
                <span className="flex items-center gap-1.5 text-xs text-foreground-500">
                  <Bot className="w-3.5 h-3.5" />
                  {realm.agentCount ?? 0}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-foreground-500">
                  <Users className="w-3.5 h-3.5" />
                  {realm.userCount ?? 0}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-foreground-500">
                  <GitFork className="w-3.5 h-3.5" />
                  {realm.workflowCount ?? 0}
                </span>
              </div>

              <p className="text-foreground-400 text-xs">
                Created {new Date(realm.createdAt).toLocaleDateString()}
              </p>

              {/* Actions */}
              {isGlobalAdmin && (
                <div
                  className="flex gap-1 mt-3 pt-3 border-t border-neutral-200/50"
                  onClick={(e) => e.stopPropagation()}
                >
                  {realm.isDefault !== 1 && (
                    <button
                      onClick={() => handleSetDefault(realm.id)}
                      title="Set as default"
                      className="p-1.5 rounded-lg text-foreground-500 hover:text-warning-400 hover:bg-warning-400/10 transition-colors"
                    >
                      <Star className="w-4 h-4" />
                    </button>
                  )}
                  {realm.isDefault !== 1 && (
                    <button
                      onClick={() => handleDelete(realm.id)}
                      disabled={deletingId === realm.id}
                      title="Delete realm"
                      className="p-1.5 rounded-lg text-foreground-500 hover:text-danger-400 hover:bg-danger-400/10 transition-colors ml-auto"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  {realm.isDefault === 1 && (
                    <span className="ml-auto text-xs text-foreground-400 italic py-1.5">
                      Default realm — cannot delete
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateRealmModal
          onClose={() => setShowCreate(false)}
          onCreated={load}
        />
      )}
    </div>
  );
}
