"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Loader2,
  Plus,
  Globe,
  Pencil,
  Trash2,
  Check,
  X,
  Key,
  Copy,
  ChevronUp,
  ChevronDown,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ApiKey } from "@/lib/api/utils/api-types";
import { API_ROUTE_GROUPS } from "@/lib/api/contract-routes";

// Route tree is derived from the ts-rest contracts (single source of truth).
const ROUTE_GROUPS = API_ROUTE_GROUPS;

function routeKey(method: string, path: string) {
  return `${method} ${path}`;
}

export function ApiKeysPanel() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [realms, setRealms] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingKey, setEditingKey] = useState<ApiKey | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(ROUTE_GROUPS.map((g) => g.group))
  );

  // Form state
  const [formName, setFormName] = useState("");
  const [formRealmId, setFormRealmId] = useState<string>("");
  const [formIsRealmAdmin, setFormIsRealmAdmin] = useState(false);
  const [formExpiry, setFormExpiry] = useState("");
  const [formAllowed, setFormAllowed] = useState<Set<string>>(new Set());
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [keysRes, realmsRes] = await Promise.all([
        fetch("/api/api-keys"),
        fetch("/api/realms"),
      ]);
      const keysData = await keysRes.json();
      const realmsData = await realmsRes.json();
      setKeys(Array.isArray(keysData.apiKeys) ? keysData.apiKeys : []);
      setRealms(Array.isArray(realmsData.realms) ? realmsData.realms : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function toggleRoute(method: string, path: string) {
    const k = routeKey(method, path);
    setFormAllowed((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function toggleGroupColumn(group: string, isWrite: boolean) {
    const entries = ROUTE_GROUPS.find((g) => g.group === group)?.routes ?? [];
    const methods = isWrite
      ? entries.flatMap((r) =>
          r.methods.filter((m) => m !== "GET").map((m) => routeKey(m, r.path))
        )
      : entries.flatMap((r) =>
          r.methods.filter((m) => m === "GET").map((m) => routeKey(m, r.path))
        );
    const allSelected = methods.every((k) => formAllowed.has(k));
    setFormAllowed((prev) => {
      const next = new Set(prev);
      for (const k of methods) allSelected ? next.delete(k) : next.add(k);
      return next;
    });
  }

  function selectAll() {
    const all = ROUTE_GROUPS.flatMap((g) =>
      g.routes.flatMap((r) => r.methods.map((m) => routeKey(m, r.path)))
    );
    setFormAllowed(new Set(all));
  }

  function clearAll() {
    setFormAllowed(new Set());
  }

  function openModal() {
    setEditingKey(null);
    setFormName("");
    setFormRealmId("");
    setFormIsRealmAdmin(false);
    setFormExpiry("");
    setFormAllowed(new Set());
    setFormError(null);
    setShowModal(true);
  }

  function openEditModal(k: ApiKey) {
    setEditingKey(k);
    setFormName(k.name);
    setFormRealmId(k.realmId ?? "");
    setFormIsRealmAdmin(k.isRealmAdmin);
    setFormExpiry(
      k.expiresAt
        ? new Date(k.expiresAt * 1000).toISOString().split("T")[0]
        : ""
    );
    setFormAllowed(new Set(k.allowedRoutes));
    setFormError(null);
    setShowModal(true);
  }

  async function handleCreate() {
    if (!formName.trim()) {
      setFormError("Name is required.");
      return;
    }
    if (formAllowed.size === 0) {
      setFormError("Select at least one route.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          allowedRoutes: Array.from(formAllowed),
          realmId: formRealmId || null,
          isRealmAdmin: formIsRealmAdmin,
          expiresAt: formExpiry
            ? Math.floor(new Date(formExpiry).getTime() / 1000)
            : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setCreatedKey(data.key);
      setShowModal(false);
      fetchData();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(id: string) {
    await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
    setConfirmRevokeId(null);
    fetchData();
  }

  async function handleUpdate() {
    if (!editingKey) return;
    if (!formName.trim()) {
      setFormError("Name is required.");
      return;
    }
    if (formAllowed.size === 0) {
      setFormError("Select at least one route.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/api-keys/${editingKey.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          allowedRoutes: Array.from(formAllowed),
          realmId: formRealmId || null,
          isRealmAdmin: formIsRealmAdmin,
          expiresAt: formExpiry
            ? Math.floor(new Date(formExpiry).getTime() / 1000)
            : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setShowModal(false);
      setEditingKey(null);
      fetchData();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  function handleCopy() {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function toggleGroup(group: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-5 h-5 animate-spin text-foreground-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* One-time key banner */}
      {createdKey && (
        <div className="bg-success-50 border border-success-300 rounded-xl p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-success-800 text-sm font-semibold mb-1">
                API key created — copy it now, it won&apos;t be shown again.
              </p>
              <code className="block bg-white/50 rounded px-3 py-2 text-sm font-mono text-success-900 break-all border border-success-200">
                {createdKey}
              </code>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-success-700 text-white text-xs font-medium hover:bg-success-800 transition"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copied ? "Copied!" : "Copy"}
              </button>
              <button
                onClick={() => setCreatedKey(null)}
                className="p-1.5 rounded-lg text-success-700 hover:bg-success-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">API Keys</h2>
          <p className="text-xs text-foreground-500 mt-0.5">
            Authenticate external clients via{" "}
            <code className="bg-background-200 px-1 rounded">X-API-Key</code>{" "}
            header
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/docs"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-background-200 border border-neutral-300 text-foreground rounded-lg text-sm font-medium hover:border-foreground-500 transition"
          >
            <BookOpen className="w-4 h-4" /> API docs
          </Link>
          <button
            onClick={openModal}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition"
          >
            <Plus className="w-4 h-4" /> New API Key
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-background-100 rounded-xl border border-neutral-200 overflow-hidden">
        {keys.length === 0 ? (
          <div className="text-center py-12 text-foreground-500 text-sm">
            No API keys yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200">
              <tr className="text-left text-xs text-foreground-500 uppercase tracking-wider">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Prefix</th>
                <th className="px-4 py-3">Scope</th>
                <th className="px-4 py-3">Routes</th>
                <th className="px-4 py-3">Last used</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {keys.map((k) => {
                const realm = realms.find((r) => r.id === k.realmId);
                return (
                  <tr
                    key={k.id}
                    className="hover:bg-background-200/40 transition"
                  >
                    <td className="px-4 py-3 font-medium text-foreground">
                      {k.name}
                    </td>
                    <td className="px-4 py-3 font-mono text-foreground-700 text-xs">
                      {k.keyPrefix}…
                    </td>
                    <td className="px-4 py-3 text-foreground-700">
                      {k.realmId ? (
                        <span className="flex items-center gap-1">
                          {realm?.name ?? k.realmId}
                          {k.isRealmAdmin && (
                            <span className="text-[10px] bg-primary-100 text-primary-700 px-1.5 rounded">
                              admin
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-foreground-500">
                          <Globe className="w-3 h-3" /> Global
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-foreground-700">
                      {k.allowedRoutes.length}
                    </td>
                    <td className="px-4 py-3 text-foreground-500 text-xs">
                      {k.lastUsedAt
                        ? new Date(k.lastUsedAt * 1000).toLocaleDateString()
                        : "Never"}
                    </td>
                    <td className="px-4 py-3 text-foreground-500 text-xs">
                      {k.expiresAt
                        ? new Date(k.expiresAt * 1000).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full text-[11px] font-medium",
                          k.isActive
                            ? "bg-success-100 text-success-700"
                            : "bg-neutral-100 text-neutral-500"
                        )}
                      >
                        {k.isActive ? "Active" : "Revoked"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEditModal(k)}
                          title="Edit"
                          className="p-1.5 rounded text-foreground-500 hover:text-primary hover:bg-background-200 transition"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {k.isActive &&
                          (confirmRevokeId === k.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleRevoke(k.id)}
                                className="px-2 py-1 bg-danger-600 text-white rounded text-xs hover:bg-danger-700"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setConfirmRevokeId(null)}
                                className="px-2 py-1 rounded text-xs text-foreground-500 hover:text-foreground"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmRevokeId(k.id)}
                              className="p-1.5 rounded text-foreground-500 hover:text-danger-500 hover:bg-danger-50 transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Create / edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background-100 rounded-2xl border border-neutral-200 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
              <h3 className="text-base font-semibold text-foreground">
                {editingKey ? "Edit API Key" : "New API Key"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg text-foreground-500 hover:text-foreground hover:bg-background-200 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal body */}
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">
                  Name <span className="text-danger-500">*</span>
                </label>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. CI Pipeline, External Dashboard"
                  className="w-full px-3 py-2 rounded-lg bg-background-200 border border-neutral-300 text-sm text-foreground placeholder:text-foreground-500 focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {/* Realm scope */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">
                  Realm scope
                </label>
                <select
                  value={formRealmId}
                  onChange={(e) => setFormRealmId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-background-200 border border-neutral-300 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">Global — full admin access</option>
                  {realms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                {formRealmId && (
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formIsRealmAdmin}
                      onChange={(e) => setFormIsRealmAdmin(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-xs text-foreground">Realm admin</span>
                  </label>
                )}
              </div>

              {/* Expiry */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">
                  Expiry (optional)
                </label>
                <input
                  type="date"
                  value={formExpiry}
                  onChange={(e) => setFormExpiry(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-background-200 border border-neutral-300 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {/* Route permissions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-foreground">
                    Allowed routes <span className="text-danger-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={selectAll}
                      className="text-xs text-primary hover:underline"
                    >
                      Select all
                    </button>
                    <button
                      onClick={clearAll}
                      className="text-xs text-foreground-500 hover:text-foreground"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="rounded-lg border border-neutral-300 overflow-hidden divide-y divide-neutral-300">
                  {ROUTE_GROUPS.map((group) => {
                    const isExpanded = expandedGroups.has(group.group);
                    const readRoutes = group.routes.flatMap((r) =>
                      r.methods
                        .filter((m) => m === "GET")
                        .map((m) => routeKey(m, r.path))
                    );
                    const writeRoutes = group.routes.flatMap((r) =>
                      r.methods
                        .filter((m) => m !== "GET")
                        .map((m) => routeKey(m, r.path))
                    );
                    const allRead =
                      readRoutes.length > 0 &&
                      readRoutes.every((k) => formAllowed.has(k));
                    const allWrite =
                      writeRoutes.length > 0 &&
                      writeRoutes.every((k) => formAllowed.has(k));
                    return (
                      <div key={group.group} className="bg-background-200">
                        {/* Group header */}
                        <div className="flex items-center px-3 py-2 gap-3">
                          <button
                            onClick={() => toggleGroup(group.group)}
                            className="flex items-center gap-1.5 flex-1 text-left text-xs font-semibold text-foreground hover:text-primary transition"
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                            {group.group}
                          </button>
                          <div className="flex items-center gap-4 text-[11px] text-foreground-500">
                            {readRoutes.length > 0 && (
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={allRead}
                                  onChange={() =>
                                    toggleGroupColumn(group.group, false)
                                  }
                                  className="rounded"
                                />
                                READ
                              </label>
                            )}
                            {writeRoutes.length > 0 && (
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={allWrite}
                                  onChange={() =>
                                    toggleGroupColumn(group.group, true)
                                  }
                                  className="rounded"
                                />
                                WRITE
                              </label>
                            )}
                          </div>
                        </div>
                        {/* Route list */}
                        {isExpanded && (
                          <div className="divide-y divide-neutral-200/50 bg-background-100">
                            {group.routes.map((route) => {
                              const reads = route.methods.filter(
                                (m) => m === "GET"
                              );
                              const writes = route.methods.filter(
                                (m) => m !== "GET"
                              );
                              return (
                                <div
                                  key={route.path}
                                  className="flex items-center px-3 py-1.5 gap-3"
                                >
                                  <span
                                    className="flex-1 font-mono text-[11px] text-foreground-700 truncate"
                                    title={route.description ?? route.path}
                                  >
                                    {route.path}
                                  </span>
                                  <div className="flex items-center gap-4">
                                    <div className="w-12 flex justify-center">
                                      {reads.length > 0 && (
                                        <input
                                          type="checkbox"
                                          checked={reads.every((m) =>
                                            formAllowed.has(
                                              routeKey(m, route.path)
                                            )
                                          )}
                                          onChange={() =>
                                            reads.forEach((m) =>
                                              toggleRoute(m, route.path)
                                            )
                                          }
                                          className="rounded"
                                        />
                                      )}
                                    </div>
                                    <div className="w-12 flex justify-center">
                                      {writes.length > 0 && (
                                        <input
                                          type="checkbox"
                                          checked={writes.every((m) =>
                                            formAllowed.has(
                                              routeKey(m, route.path)
                                            )
                                          )}
                                          onChange={() =>
                                            writes.forEach((m) =>
                                              toggleRoute(m, route.path)
                                            )
                                          }
                                          className="rounded"
                                        />
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-foreground-500 mt-1.5">
                  {formAllowed.size} route(s) selected
                </p>
              </div>

              {formError && (
                <p className="text-danger-500 text-xs bg-danger-50 rounded-lg px-3 py-2">
                  {formError}
                </p>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-neutral-200">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-lg text-sm text-foreground-500 hover:text-foreground transition"
              >
                Cancel
              </button>
              <button
                onClick={editingKey ? handleUpdate : handleCreate}
                disabled={submitting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : editingKey ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Key className="w-4 h-4" />
                )}
                {editingKey ? "Save changes" : "Create Key"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
