import { useState, useEffect } from "react";
import {
  Key,
  Plus,
  X,
  Edit2,
  Trash2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { apiKeysClient, unwrap } from "@/lib/api/ts-rest/client";
import type { ApiKey } from "@/lib/api/utils/api-types";
import { CopyButton } from "./primitives";
import { RoutePermissionsEditor, isFullAccess } from "./RoutePermissionsEditor";

interface KeyEditState {
  name: string;
  routes: string[];
  expiry: string;
  saving: boolean;
  error: string;
}

function KeyRow({
  k,
  onUpdate,
  onRevoke,
}: {
  k: ApiKey;
  onUpdate: (id: string, patch: ApiKey) => void;
  onRevoke: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const initialState = (): KeyEditState => ({
    name: k.name,
    routes: k.allowedRoutes,
    expiry: k.expiresAt
      ? new Date(k.expiresAt * 1000).toISOString().split("T")[0]
      : "",
    saving: false,
    error: "",
  });
  const [state, setState] = useState<KeyEditState>(initialState);

  const openEdit = () => {
    setState(initialState());
    setEditing(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!state.name.trim()) {
      setState((s) => ({ ...s, error: "Name is required" }));
      return;
    }
    if (state.routes.length === 0) {
      setState((s) => ({ ...s, error: "At least one permission is required" }));
      return;
    }

    setState((s) => ({ ...s, saving: true, error: "" }));
    try {
      const updated = unwrap(
        await apiKeysClient.update({
          params: { id: k.id },
          body: {
            name: state.name.trim(),
            allowedRoutes: state.routes,
            expiresAt: state.expiry
              ? Math.floor(new Date(state.expiry).getTime() / 1000)
              : null,
          },
        })
      );
      onUpdate(k.id, updated);
      setEditing(false);
    } catch (err) {
      setState((s) => ({
        ...s,
        saving: false,
        error: err instanceof Error ? err.message : "Save failed",
      }));
    }
  };

  if (editing) {
    return (
      <form
        onSubmit={save}
        className="px-5 py-4 bg-background-200/40 border-b border-neutral-200/60 space-y-3"
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-foreground-400 uppercase tracking-wider font-medium block mb-1">
              Name
            </label>
            <input
              type="text"
              value={state.name}
              onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
              maxLength={128}
              autoFocus
              className="w-full bg-background-100 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/50"
            />
          </div>
          <div>
            <label className="text-[11px] text-foreground-400 uppercase tracking-wider font-medium block mb-1">
              Expires
            </label>
            <input
              type="date"
              value={state.expiry}
              onChange={(e) =>
                setState((s) => ({ ...s, expiry: e.target.value }))
              }
              className="w-full bg-background-100 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/50"
            />
          </div>
        </div>
        <div>
          <label className="text-[11px] text-foreground-400 uppercase tracking-wider font-medium block mb-2">
            Permissions
          </label>
          <RoutePermissionsEditor
            value={state.routes}
            onChange={(routes) => setState((s) => ({ ...s, routes }))}
          />
        </div>
        {state.error && <p className="text-xs text-danger-600">{state.error}</p>}
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={state.saving}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-40 transition"
          >
            {state.saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-background-200 border border-neutral-300 hover:border-foreground-500 text-foreground transition flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="px-5 py-3 flex items-center justify-between gap-3 group">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">
            {k.name}
          </span>
          {!k.isActive && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-danger-100 text-danger-700 border border-danger-300 rounded-full">
              Revoked
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          <span className="font-mono text-[11px] text-foreground-400">
            {k.keyPrefix}…
          </span>
          <span className="text-[11px] text-foreground-400">
            {isFullAccess(k.allowedRoutes)
              ? "Full access"
              : `${k.allowedRoutes.length} permission${k.allowedRoutes.length === 1 ? "" : "s"}`}
          </span>
          {k.expiresAt && (
            <span className="flex items-center gap-0.5 text-[11px] text-foreground-400">
              <Clock className="w-3 h-3" />
              expires {new Date(k.expiresAt * 1000).toLocaleDateString()}
            </span>
          )}
          {k.lastUsedAt && (
            <span className="text-[11px] text-foreground-400">
              last used {new Date(k.lastUsedAt * 1000).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition">
        <button
          type="button"
          onClick={openEdit}
          title="Edit key"
          className="p-1.5 text-foreground-400 hover:text-foreground rounded-lg hover:bg-background-200 transition"
        >
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onRevoke(k.id)}
          title="Revoke key"
          className="p-1.5 text-foreground-400 hover:text-danger-600 rounded-lg hover:bg-background-200 transition"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export function ApiKeysSection() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formRoutes, setFormRoutes] = useState<string[]>([]);
  const [formExpiry, setFormExpiry] = useState("");
  const [formError, setFormError] = useState("");

  const load = () => {
    apiKeysClient
      .list()
      .then((res) => setKeys(unwrap(res).apiKeys))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!formName.trim()) {
      setFormError("Name is required");
      return;
    }
    if (formRoutes.length === 0) {
      setFormError("At least one permission is required");
      return;
    }

    setCreating(true);
    try {
      const data = unwrap(
        await apiKeysClient.create({
          body: {
            name: formName.trim(),
            allowedRoutes: formRoutes,
            expiresAt: formExpiry
              ? Math.floor(new Date(formExpiry).getTime() / 1000)
              : null,
          },
        })
      );
      setNewKey(data.key);
      setFormName("");
      setFormRoutes([]);
      setFormExpiry("");
      setShowForm(false);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create key");
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = (id: string, patch: ApiKey) => {
    setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, ...patch } : k)));
  };

  const revoke = async (id: string) => {
    if (!confirm("Revoke this API key? This cannot be undone.")) return;
    await apiKeysClient.remove({ params: { id } });
    setKeys((prev) => prev.filter((k) => k.id !== id));
  };

  return (
    <section className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-foreground-500" />
          <h2 className="text-sm font-semibold text-foreground">API Keys</h2>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowForm((v) => !v);
            setFormError("");
            setNewKey(null);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-600 hover:bg-primary-500 text-white transition"
        >
          <Plus className="w-3.5 h-3.5" /> New key
        </button>
      </div>

      {/* One-time key reveal */}
      {newKey && (
        <div className="mx-5 mt-4 p-3 bg-success-50 border border-success-300 rounded-lg flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-success-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-success-700 mb-1">
              Key created — copy it now, it won&apos;t be shown again
            </p>
            <div className="flex items-center gap-2">
              <code className="text-xs font-mono text-success-800 bg-success-100 px-2 py-1 rounded break-all">
                {newKey}
              </code>
              <CopyButton value={newKey} />
            </div>
            <button
              type="button"
              onClick={() => setNewKey(null)}
              className="mt-1.5 text-[11px] text-success-600 hover:text-success-800 underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <form
          onSubmit={create}
          className="mx-5 my-4 p-4 bg-background-200/60 border border-neutral-300 rounded-xl space-y-3"
        >
          <p className="text-xs font-semibold text-foreground">New API Key</p>

          <div>
            <label className="text-[11px] text-foreground-400 uppercase tracking-wider font-medium block mb-1">
              Name
            </label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. MCP Gateway"
              maxLength={128}
              className="w-full bg-background-100 border border-neutral-300 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
            />
          </div>

          <div>
            <label className="text-[11px] text-foreground-400 uppercase tracking-wider font-medium block mb-2">
              Permissions
            </label>
            <RoutePermissionsEditor value={formRoutes} onChange={setFormRoutes} />
          </div>

          <div>
            <label className="text-[11px] text-foreground-400 uppercase tracking-wider font-medium block mb-1">
              Expires (optional)
            </label>
            <input
              type="date"
              value={formExpiry}
              onChange={(e) => setFormExpiry(e.target.value)}
              className="bg-background-100 border border-neutral-300 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/50"
            />
          </div>

          {formError && <p className="text-xs text-danger-600">{formError}</p>}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={creating}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-40 transition"
            >
              {creating ? "Creating…" : "Create"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-background-200 border border-neutral-300 hover:border-foreground-500 text-foreground transition flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Cancel
            </button>
          </div>
        </form>
      )}

      {/* Key list */}
      {loading ? (
        <div className="px-5 py-6 space-y-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-10 bg-background-200 rounded-lg animate-pulse"
            />
          ))}
        </div>
      ) : keys.length === 0 ? (
        <div className="px-5 py-6 text-center text-sm text-foreground-400">
          No API keys yet.
        </div>
      ) : (
        <div className="divide-y divide-neutral-200/60">
          {keys.map((k) => (
            <KeyRow key={k.id} k={k} onUpdate={handleUpdate} onRevoke={revoke} />
          ))}
        </div>
      )}

      <div className="px-5 py-3 border-t border-neutral-200/60">
        <p className="text-xs text-foreground-400">
          API keys grant programmatic access. Only global admins can manage
          keys. Each key is shown only once at creation.
        </p>
      </div>
    </section>
  );
}
