"use client";

import { useState, useEffect } from "react";
import { Mail, Send, Loader2, Check, AlertCircle } from "lucide-react";
import { Field, StatusBadge, IntegrationPanel, IntegrationHeader } from "./shared";

export function SmtpPanel() {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [secure, setSecure] = useState(false);
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [from, setFrom] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error" | "ok" | "fail">("idle");
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => {
    fetch("/api/server/smtp")
      .then((r) => r.json())
      .then(
        (d: {
          configured?: boolean;
          host?: string;
          port?: number;
          secure?: boolean;
          user?: string;
          password?: string;
          from?: string;
        }) => {
          if (d.configured) {
            setHost(d.host ?? "");
            setPort(String(d.port ?? 587));
            setSecure(d.secure ?? false);
            setUser(d.user ?? "");
            setPassword(d.password ?? "");
            setFrom(d.from ?? "");
          }
        }
      )
      .finally(() => setLoading(false));
  }, []);

  const flash = (s: typeof status, msg = "") => {
    setStatus(s);
    setStatusMsg(msg);
    setTimeout(() => setStatus("idle"), 3500);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await fetch("/api/server/smtp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, port: parseInt(port, 10), secure, user, password, from }),
      });
      flash(r.ok ? "saved" : "error", r.ok ? "" : "Save failed");
    } catch {
      flash("error", "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const r = await fetch("/api/server/smtp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, port: parseInt(port, 10), secure, user, password, from }),
      });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      flash(d.ok ? "ok" : "fail", d.error ?? (d.ok ? "Connection successful" : "Test failed"));
    } catch {
      flash("fail", "Test failed");
    } finally {
      setTesting(false);
    }
  };

  return (
    <IntegrationPanel>
      <IntegrationHeader
        icon={Mail}
        title="SMTP / Email"
        description="Used to send QR codes to users"
      />
      <form onSubmit={save} className="p-5 space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-foreground-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="SMTP Host"
                id="smtp-host"
                value={host}
                onChange={setHost}
                placeholder="smtp.example.com"
              />
              <div className="flex gap-3">
                <div className="flex-1">
                  <Field
                    label="Port"
                    id="smtp-port"
                    value={port}
                    onChange={setPort}
                    placeholder="587"
                  />
                </div>
                <div className="flex flex-col gap-1 pt-1">
                  <label className="text-xs text-foreground-400 uppercase tracking-wider font-medium">
                    TLS
                  </label>
                  <button
                    type="button"
                    onClick={() => setSecure((s) => !s)}
                    className={`mt-1 w-11 h-6 rounded-full relative transition-colors ${
                      secure ? "bg-primary-600" : "bg-neutral-300"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        secure && "translate-x-5"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Username" id="smtp-user" value={user} onChange={setUser} />
              <Field
                label="Password"
                id="smtp-pass"
                value={password}
                onChange={setPassword}
                showToggle
              />
            </div>
            <Field label="From address" id="smtp-from" value={from} onChange={setFrom} />
            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-1.5 text-xs font-medium rounded-lg bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-40 transition flex items-center gap-1.5"
              >
                {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                Save
              </button>
              <button
                type="button"
                onClick={test}
                disabled={testing || !host}
                className="px-4 py-1.5 text-xs font-medium rounded-lg bg-background-200 border border-neutral-300 hover:border-foreground-500 text-foreground disabled:opacity-40 transition flex items-center gap-1.5"
              >
                {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                Test
              </button>
              {status === "saved" && <StatusBadge status="success" message="Saved" />}
              {status === "ok" && <StatusBadge status="success" message={statusMsg} />}
              {(status === "error" || status === "fail") && (
                <StatusBadge status="error" message={statusMsg} />
              )}
            </div>
          </>
        )}
      </form>
    </IntegrationPanel>
  );
}
