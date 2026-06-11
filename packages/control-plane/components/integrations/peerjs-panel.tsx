"use client";

import { useState, useEffect } from "react";
import { Network, Loader2 } from "lucide-react";
import { Field, StatusBadge, IntegrationPanel, IntegrationHeader } from "./shared";

export function PeerjsPanel() {
  const [peerjsHost, setPeerjsHost] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  useEffect(() => {
    fetch("/api/server/settings")
      .then((r) => r.json())
      .then((d: { peerjsHost?: string }) => {
        setPeerjsHost(d.peerjsHost ?? "");
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await fetch("/api/server/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peerjsHost }),
      });
      setStatus(r.ok ? "saved" : "error");
      setTimeout(() => setStatus("idle"), 3500);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <IntegrationPanel>
      <IntegrationHeader
        icon={Network}
        title="PeerJS / WebRTC"
        description="P2P communication relay server"
      />
      <form onSubmit={save} className="p-5 space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-foreground-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <Field
              label="PeerJS Server Host"
              id="peerjs-host"
              value={peerjsHost}
              onChange={setPeerjsHost}
              placeholder="peerjs.example.com (optional)"
            />
            <div className="text-xs text-foreground-400 space-y-1">
              <p>Leave empty to use built-in PeerJS server</p>
              <p>Format: hostname (with optional port, e.g., peerjs.example.com:9000)</p>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-1.5 text-xs font-medium rounded-lg bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-40 transition flex items-center gap-1.5"
              >
                {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                Save
              </button>
              {status === "saved" && <StatusBadge status="success" message="Saved" />}
              {status === "error" && <StatusBadge status="error" message="Failed to save" />}
            </div>
          </>
        )}
      </form>
    </IntegrationPanel>
  );
}
