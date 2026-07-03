import { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Pencil,
  Check,
  X,
  RefreshCw,
} from "lucide-react";
import {
  adminApi,
  unwrap,
} from "@/lib/api/ts-rest/client";
import { SafeModel } from "@/lib/contracts";

export function OverviewTab({
  model,
  onSaved,
  isAdmin,
}: {
  model: SafeModel;
  onSaved: () => void;
  isAdmin: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(model.name);
  const [description, setDescription] = useState(model.description ?? "");
  const [baseUrl, setBaseUrl] = useState(model.baseUrl);
  const [modelId, setModelId] = useState(model.modelId);
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">(
    model.status === "inactive" ? "inactive" : "active"
  );
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validateResult, setValidateResult] = useState<{
    ok: boolean;
    models?: string[];
    error?: string;
  } | null>(null);

  async function handleSave() {
    setSaving(true);
    try {
      unwrap(
        await adminApi.models.update({
          params: { id: model.id },
          body: {
            name,
            description: description || null,
            baseUrl,
            modelId,
            apiKey: apiKey || undefined,
            status,
          },
        })
      );
      setEditing(false);
      onSaved();
    } catch {
      // keep editing open on failure
    } finally {
      setSaving(false);
    }
  }

  async function handleValidate() {
    setValidating(true);
    setValidateResult(null);
    try {
      const data = unwrap(
        await adminApi.models.validate({ params: { id: model.id } })
      );
      setValidateResult(data);
    } catch {
      setValidateResult({ ok: false, models: [], error: "Validation failed" });
    } finally {
      setValidating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-neutral-200 bg-background-100 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            Endpoint Configuration
          </h3>
          {isAdmin && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 text-xs text-foreground-500 hover:text-foreground transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
          )}
          {editing && (
            <div className="flex gap-2">
              <button
                onClick={() => setEditing(false)}
                className="flex items-center gap-1 text-xs text-foreground-500 hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1 text-xs text-primary-700 hover:text-primary-300"
              >
                <Check className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save"}
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          {[
            { label: "Name", value: name, setter: setName, editable: true },
            { label: "Provider", value: model.provider, editable: false },
            {
              label: "Model ID",
              value: modelId,
              setter: setModelId,
              editable: true,
              mono: true,
            },
            {
              label: "Base URL",
              value: baseUrl,
              setter: setBaseUrl,
              editable: true,
              mono: true,
            },
          ].map(({ label, value, setter, editable, mono }) => (
            <div key={label}>
              <p className="text-xs text-foreground-500 mb-1">{label}</p>
              {editing && editable && setter ? (
                <input
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  className="w-full bg-background border border-neutral-200 rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              ) : (
                <p
                  className={`text-foreground ${mono ? "font-mono text-xs" : ""}`}
                >
                  {value}
                </p>
              )}
            </div>
          ))}

          {editing && (
            <div>
              <p className="text-xs text-foreground-500 mb-1">
                API Key{" "}
                <span className="text-foreground-400">
                  (leave blank to keep existing)
                </span>
              </p>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-background border border-neutral-200 rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          )}

          <div>
            <p className="text-xs text-foreground-500 mb-1">API Key</p>
            <p className="text-foreground">
              {model.hasApiKey ? (
                "••••••••"
              ) : (
                <span className="text-foreground-400 italic">None</span>
              )}
            </p>
          </div>

          <div>
            <p className="text-xs text-foreground-500 mb-1">LiteLLM name</p>
            <code className="text-xs font-mono text-foreground-500">
              {model.litellmModelName ?? "—"}
            </code>
          </div>

          {editing && (
            <div>
              <p className="text-xs text-foreground-500 mb-1">Status</p>
              <select
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as "active" | "inactive")
                }
                className="w-full bg-background border border-neutral-200 rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-background-100 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">
            Connection Test
          </h3>
          <button
            onClick={handleValidate}
            disabled={validating}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-background-200 hover:bg-neutral-200 border border-neutral-200 text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${validating ? "animate-spin" : ""}`}
            />
            {validating ? "Testing…" : "Test connection"}
          </button>
        </div>
        {validateResult === null ? (
          <p className="text-xs text-foreground-500">
            Click "Test connection" to verify the endpoint is reachable.
          </p>
        ) : validateResult.ok ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-success-600 text-sm">
              <CheckCircle2 className="w-4 h-4" />
              Endpoint reachable
            </div>
            {validateResult.models && validateResult.models.length > 0 && (
              <div>
                <p className="text-xs text-foreground-500 mb-1">
                  Available models:
                </p>
                <div className="flex flex-wrap gap-1">
                  {validateResult.models.map((m) => (
                    <code
                      key={m}
                      className="text-xs font-mono bg-background border border-neutral-200 rounded px-2 py-0.5 text-foreground-500"
                    >
                      {m}
                    </code>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-danger-600 text-sm">
            <XCircle className="w-4 h-4" />
            {validateResult.error ?? "Endpoint unreachable"}
          </div>
        )}
      </div>
    </div>
  );
}
