"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Webhook as WebhookIcon,
  Loader2,
  Plus,
  Trash2,
  Pencil,
  Copy,
  Check,
  RefreshCw,
  KeyRound,
} from "lucide-react";
import {
  Field,
  StatusBadge,
  IntegrationPanel,
  IntegrationHeader,
  IntegrationModal,
} from "./shared";
import { adminApi, unwrap } from "@/lib/api/ts-rest/client";
import { WEBHOOK_EVENTS } from "@vaultysclaw/shared";
import type { Webhook, WebhookWithSecret } from "@/lib/contracts";

/** Events grouped by their catalog `group`, in catalog order. */
const EVENT_GROUPS = (() => {
  const groups: { group: string; events: typeof WEBHOOK_EVENTS }[] = [];
  for (const ev of WEBHOOK_EVENTS) {
    let g = groups.find((x) => x.group === ev.group);
    if (!g) {
      g = { group: ev.group, events: [] };
      groups.push(g);
    }
    g.events.push(ev);
  }
  return groups;
})();

export function WebhooksPanel() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal / form state
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Webhook | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // One-time secret reveal (create / regenerate)
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const data = unwrap(await adminApi.webhooks.list());
      setWebhooks(data.webhooks);
    } catch {
      /* keep last state */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setUrl("");
    setSelectedEvents(new Set());
    setIsActive(true);
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (w: Webhook) => {
    setEditing(w);
    setName(w.name);
    setDescription(w.description ?? "");
    setUrl(w.url);
    setSelectedEvents(new Set(w.events));
    setIsActive(w.isActive);
    setFormError("");
    setModalOpen(true);
  };

  const toggleEvent = (type: string) => {
    setSelectedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const toggleGroup = (events: typeof WEBHOOK_EVENTS) => {
    setSelectedEvents((prev) => {
      const next = new Set(prev);
      const allOn = events.every((e) => next.has(e.type));
      for (const e of events) {
        if (allOn) next.delete(e.type);
        else next.add(e.type);
      }
      return next;
    });
  };

  const submit = async () => {
    setFormError("");
    if (!name.trim()) return setFormError("Name is required");
    if (!url.trim()) return setFormError("Endpoint URL is required");
    try {
      new URL(url);
    } catch {
      return setFormError("Endpoint must be a valid URL");
    }

    setSubmitting(true);
    try {
      const events = Array.from(selectedEvents);
      if (editing) {
        unwrap(
          await adminApi.webhooks.update({
            params: { id: editing.id },
            body: {
              name: name.trim(),
              description: description.trim() || null,
              url: url.trim(),
              events,
              isActive,
            },
          })
        );
        setModalOpen(false);
      } else {
        const created = unwrap(
          await adminApi.webhooks.create({
            body: {
              name: name.trim(),
              description: description.trim() || null,
              url: url.trim(),
              events,
              isActive,
            },
          })
        ) as WebhookWithSecret;
        setModalOpen(false);
        setRevealedSecret(created.secret);
      }
      await fetchData();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to save webhook");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (w: Webhook) => {
    if (!confirm(`Delete webhook "${w.name}"? This cannot be undone.`)) return;
    try {
      unwrap(await adminApi.webhooks.remove({ params: { id: w.id } }));
      await fetchData();
    } catch {
      /* noop */
    }
  };

  const regenerate = async (w: Webhook) => {
    if (
      !confirm(
        `Regenerate the signing secret for "${w.name}"? The previous secret will stop working immediately.`
      )
    )
      return;
    try {
      const res = unwrap(
        await adminApi.webhooks.regenerateSecret({ params: { id: w.id } })
      ) as WebhookWithSecret;
      setRevealedSecret(res.secret);
      await fetchData();
    } catch {
      /* noop */
    }
  };

  const copySecret = () => {
    if (!revealedSecret) return;
    navigator.clipboard.writeText(revealedSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const selectedCount = selectedEvents.size;

  return (
    <IntegrationPanel>
      <IntegrationHeader
        icon={WebhookIcon}
        title="Webhooks"
        description="Send signed HTTP events to external endpoints"
      />

      <div className="p-5 space-y-4">
        {/* One-time secret reveal banner */}
        {revealedSecret && (
          <div className="rounded-lg border border-success-300 bg-success-50 p-4 space-y-2">
            <div className="flex items-center gap-2 text-success-700 text-sm font-medium">
              <KeyRound className="w-4 h-4" />
              Signing secret — copy it now, it won&apos;t be shown again
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-background-200 border border-neutral-300 rounded px-3 py-2 font-mono break-all text-foreground">
                {revealedSecret}
              </code>
              <button
                onClick={copySecret}
                className="px-3 py-2 text-xs font-medium rounded-lg bg-primary-600 hover:bg-primary-500 text-white transition flex items-center gap-1.5"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <button
              onClick={() => setRevealedSecret(null)}
              className="text-xs text-foreground-500 hover:text-foreground"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-xs text-foreground-500">
            {webhooks.length} webhook{webhooks.length === 1 ? "" : "s"} configured
          </p>
          <button
            onClick={openCreate}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-600 hover:bg-primary-500 text-white transition flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            New webhook
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-foreground-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : webhooks.length === 0 ? (
          <div className="text-sm text-foreground-400 py-6 text-center">
            No webhooks yet. Create one to start receiving events.
          </div>
        ) : (
          <div className="space-y-2">
            {webhooks.map((w) => (
              <div
                key={w.id}
                className="rounded-lg border border-neutral-200 bg-background-100 p-4 flex items-start gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">
                      {w.name}
                    </span>
                    <StatusBadge
                      status={w.isActive ? "success" : "idle"}
                      message={w.isActive ? "Active" : "Inactive"}
                    />
                  </div>
                  {w.description && (
                    <p className="text-xs text-foreground-500 mt-0.5 truncate">
                      {w.description}
                    </p>
                  )}
                  <p className="text-xs text-foreground-400 mt-1 font-mono truncate">
                    {w.url}
                  </p>
                  <p className="text-xs text-foreground-400 mt-1">
                    {w.events.length} event{w.events.length === 1 ? "" : "s"} · secret{" "}
                    <code className="font-mono">{w.secretPreview}</code>
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => regenerate(w)}
                    title="Regenerate secret"
                    className="p-1.5 rounded-lg text-foreground-500 hover:text-foreground hover:bg-background-200 transition"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => openEdit(w)}
                    title="Edit"
                    className="p-1.5 rounded-lg text-foreground-500 hover:text-foreground hover:bg-background-200 transition"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => remove(w)}
                    title="Delete"
                    className="p-1.5 rounded-lg text-danger-500 hover:text-danger-600 hover:bg-danger-50 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <IntegrationModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit webhook" : "New webhook"}
        onSave={submit}
        isSaving={submitting}
      >
        <div className="space-y-4">
          <Field label="Name" id="wh-name" value={name} onChange={setName} placeholder="My integration" />
          <Field
            label="Description"
            id="wh-desc"
            value={description}
            onChange={setDescription}
            placeholder="Optional"
          />
          <Field
            label="Endpoint URL"
            id="wh-url"
            value={url}
            onChange={setUrl}
            placeholder="https://example.com/webhooks/vaultysclaw"
          />

          <div className="flex items-center gap-3">
            <label className="text-xs text-foreground-400 uppercase tracking-wider font-medium">
              Active
            </label>
            <button
              type="button"
              onClick={() => setIsActive((s) => !s)}
              className={`w-11 h-6 rounded-full relative transition-colors ${
                isActive ? "bg-primary-600" : "bg-neutral-300"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  isActive ? "translate-x-5" : ""
                }`}
              />
            </button>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-foreground-400 uppercase tracking-wider font-medium">
                Events to send
              </label>
              <span className="text-xs text-foreground-500">{selectedCount} selected</span>
            </div>
            <div className="space-y-4 max-h-72 overflow-y-auto border border-neutral-200 rounded-lg p-3">
              {EVENT_GROUPS.map(({ group, events }) => {
                const allOn = events.every((e) => selectedEvents.has(e.type));
                return (
                  <div key={group}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(events)}
                      className="text-xs font-semibold text-foreground-600 hover:text-foreground mb-1.5 flex items-center gap-1.5"
                    >
                      <span
                        className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                          allOn ? "bg-primary-600 border-primary-600" : "border-neutral-300"
                        }`}
                      >
                        {allOn && <Check className="w-2.5 h-2.5 text-white" />}
                      </span>
                      {group}
                    </button>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-5">
                      {events.map((ev) => (
                        <label
                          key={ev.type}
                          className="flex items-center gap-2 text-xs text-foreground cursor-pointer"
                          title={ev.description}
                        >
                          <input
                            type="checkbox"
                            checked={selectedEvents.has(ev.type)}
                            onChange={() => toggleEvent(ev.type)}
                            className="accent-primary-600"
                          />
                          {ev.label}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {formError && <p className="text-xs text-danger-600">{formError}</p>}
        </div>
      </IntegrationModal>
    </IntegrationPanel>
  );
}
