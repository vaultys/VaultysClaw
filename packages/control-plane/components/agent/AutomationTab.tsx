"use client";

import { adminAgentsClient, unwrap } from "@/lib/api/ts-rest/client";
import { useState } from "react";

export function AutomationTab({ agentId }: { agentId: string }) {
  return (
    <div className="space-y-8">
      <TaskSection agentId={agentId} />
      <ScheduleSection agentId={agentId} />
    </div>
  );
}

function TaskSection({ agentId }: { agentId: string }) {
  const [action, setAction] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const enqueue = async () => {
    if (!action.trim()) return;
    setStatus(null);
    const { action: sentAction } = unwrap(
      await adminAgentsClient.sendTask({ params: { did: agentId }, body: { action } })
    );
    setStatus(`Task sent: ${sentAction}`);
    setAction("");
  };

  return (
    <div>
      <h2 className="text-base font-semibold text-foreground mb-1">
        Enqueue Task
      </h2>
      <p className="text-xs text-foreground-500 mb-4">
        Send a one-off action to the agent&apos;s task queue.
      </p>
      <div className="flex gap-2">
        <input
          value={action}
          onChange={(e) => setAction(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && enqueue()}
          placeholder="Task action…"
          className="flex-1 px-3 py-2 text-sm bg-background-200 border border-neutral-200 rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary-500/50"
        />
        <button
          onClick={enqueue}
          className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors"
        >
          Send
        </button>
      </div>
      {status && (
        <p
          className={`mt-2 text-xs ${status.startsWith("Error") ? "text-danger-600" : "text-success-700"}`}
        >
          {status}
        </p>
      )}
    </div>
  );
}

function ScheduleSection({ agentId }: { agentId: string }) {
  const [form, setForm] = useState({ id: "", name: "", cron: "", action: "" });
  const [status, setStatus] = useState<string | null>(null);

  const field = (key: keyof typeof form, placeholder: string) => (
    <div>
      <label className="text-xs text-foreground-500 uppercase tracking-wider block mb-1">
        {placeholder}
      </label>
      <input
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={key === "cron" ? "*/5 * * * *" : placeholder}
        className="w-full px-3 py-2 text-sm bg-background-200 border border-neutral-200 rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary-500/50"
      />
    </div>
  );

  const upsert = async () => {
    if (!form.id || !form.name || !form.cron || !form.action) {
      setStatus("All fields are required");
      return;
    }
    setStatus(null);
    await adminAgentsClient.createSchedule({ params: { did: agentId }, body: form });
    setStatus(`Schedule "${form.name}" sent`);
    setForm({ id: "", name: "", cron: "", action: "" });
  };

  const del = async () => {
    if (!form.id) {
      setStatus("Enter schedule ID to delete");
      return;
    }
    await adminAgentsClient.deleteSchedule({ params: { did: agentId, id: form.id } });
    setStatus(`Schedule "${form.id}" deleted`);
    setForm({ id: "", name: "", cron: "", action: "" });
  };

  return (
    <div>
      <h2 className="text-base font-semibold text-foreground mb-1">
        Manage Schedules
      </h2>
      <p className="text-xs text-foreground-500 mb-4">
        Create, update, or delete cron-based agent schedules.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {field("id", "ID")}
        {field("name", "Name")}
        {field("cron", "Cron expression")}
        {field("action", "Action")}
      </div>
      <div className="flex gap-2">
        <button
          onClick={upsert}
          className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors"
        >
          Upsert
        </button>
        <button
          onClick={del}
          className="px-4 py-2 text-sm bg-danger-600/80 text-white rounded-lg hover:bg-danger-600 transition-colors"
        >
          Delete by ID
        </button>
      </div>
      {status && (
        <p
          className={`mt-2 text-xs ${status.startsWith("Error") ? "text-danger-600" : "text-success-700"}`}
        >
          {status}
        </p>
      )}
    </div>
  );
}
