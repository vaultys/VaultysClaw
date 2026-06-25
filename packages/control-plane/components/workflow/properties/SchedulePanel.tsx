"use client";

import { useEffect, useState } from "react";
import { workflowsClient, unwrap } from "@/lib/api/ts-rest/client";
import { CRON_PRESETS } from "./types";

export function SchedulePanel({ workflowId }: { workflowId: string | null }) {
  const [cron, setCron] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [nextRun, setNextRun] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [customMode, setCustomMode] = useState(false);

  useEffect(() => {
    if (!workflowId || workflowId === "default") return;
    setLoading(true);
    workflowsClient
      .getSchedule({ params: { id: workflowId } })
      .then((res) => {
        if (res.status !== 200) return;
        const d = res.body;
        setCron(d.scheduleCron ?? "");
        setEnabled(Boolean(d.scheduleEnabled));
        setNextRun(d.scheduleNextRun ? String(d.scheduleNextRun) : null);
        setLastRun(d.scheduleLastRun ? String(d.scheduleLastRun) : null);
        const isPreset = CRON_PRESETS.some(
          (p) => p.value === d.scheduleCron && p.value !== ""
        );
        setCustomMode(!!d.scheduleCron && !isPreset);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [workflowId]);

  const handleSave = async () => {
    if (!workflowId) return;
    setSaving(true);
    try {
      const d = unwrap(
        await workflowsClient.setSchedule({
          params: { id: workflowId },
          body: { cron: cron || undefined, enabled },
        })
      );
      setNextRun(d.scheduleNextRun ?? null);
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleDisable = async () => {
    if (!workflowId) return;
    setSaving(true);
    try {
      await workflowsClient.clearSchedule({ params: { id: workflowId } });
      setCron("");
      setEnabled(false);
      setNextRun(null);
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  };

  if (!workflowId || workflowId === "default") {
    return (
      <div className="text-xs text-foreground-400 italic">
        Save the workflow first to configure a schedule.
      </div>
    );
  }

  if (loading)
    return <div className="text-xs text-foreground-500">Loading schedule…</div>;

  const selectedPreset = customMode
    ? ""
    : (CRON_PRESETS.find((p) => p.value === cron)?.value ?? "");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-foreground-700">
          Auto-run
        </label>
        <button
          onClick={() => setEnabled(!enabled)}
          className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${enabled ? "bg-success-500" : "bg-neutral-200"}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5 ${enabled ? "translate-x-4.5" : "translate-x-0.5"}`}
          />
        </button>
      </div>

      <div>
        <label className="block text-xs font-medium text-foreground-700 mb-1">
          Frequency
        </label>
        <select
          value={selectedPreset}
          onChange={(e) => {
            if (e.target.value === "") {
              setCustomMode(true);
            } else {
              setCustomMode(false);
              setCron(e.target.value);
            }
          }}
          className="w-full px-2 py-1.5 bg-background-100 text-foreground border border-neutral-200 rounded text-xs focus:ring-1 focus:ring-success-500"
        >
          {CRON_PRESETS.map((p) => (
            <option key={p.label} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {customMode && (
        <div>
          <label className="block text-xs font-medium text-foreground-700 mb-1">
            Cron expression
          </label>
          <input
            type="text"
            value={cron}
            onChange={(e) => setCron(e.target.value)}
            placeholder="0 9 * * *"
            className="w-full px-2 py-1.5 bg-background-100 text-foreground border border-neutral-200 rounded text-xs font-mono focus:ring-1 focus:ring-success-500"
          />
          <p className="text-[10px] text-foreground-400 mt-1">
            5 fields: minute hour day month weekday
          </p>
        </div>
      )}

      {nextRun && (
        <p className="text-[10px] text-foreground-500">
          Next run:{" "}
          <span className="font-medium text-foreground">
            {new Date(nextRun).toLocaleString()}
          </span>
        </p>
      )}
      {lastRun && (
        <p className="text-[10px] text-foreground-400">
          Last run: {new Date(lastRun).toLocaleString()}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 text-xs py-1.5 bg-success-600 text-white rounded hover:bg-success-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save schedule"}
        </button>
        {(cron || enabled) && (
          <button
            onClick={handleDisable}
            disabled={saving}
            className="text-xs px-2 py-1.5 border border-neutral-200 text-foreground-500 rounded hover:bg-background-200 disabled:opacity-50"
          >
            Disable
          </button>
        )}
      </div>

      {status === "saved" && (
        <p className="text-xs text-success-600">✓ Schedule saved</p>
      )}
      {status === "error" && (
        <p className="text-xs text-danger-500">✗ Failed to save schedule</p>
      )}
    </div>
  );
}
