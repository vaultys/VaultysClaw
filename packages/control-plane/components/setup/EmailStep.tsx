"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { Field, StepFooter } from "./ui";

export function EmailStep({ onNext }: { onNext: () => void }) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [from, setFrom] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "fail"; text: string } | null>(
    null
  );

  const flash = (type: "ok" | "fail", text: string) => {
    setMsg({ type, text });
    if (type === "ok") setTimeout(onNext, 1200);
    else setTimeout(() => setMsg(null), 3000);
  };

  const smtpBody = () => ({
    host,
    port: +port,
    secure: +port === 465,
    user,
    password,
    from,
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!host.trim()) {
      flash("fail", "SMTP host is required");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/server/smtp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(smtpBody()),
      });
      if (r.ok) flash("ok", "SMTP saved — advancing…");
      else flash("fail", "Save failed");
    } catch {
      flash("fail", "Network error");
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
        body: JSON.stringify(smtpBody()),
      });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (d.ok) flash("ok", "Connection successful");
      else flash("fail", d.error ?? "Test failed");
    } catch {
      flash("fail", "Test failed");
    } finally {
      setTesting(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-5">
      <p className="text-foreground-500 text-sm leading-relaxed">
        Configure SMTP so VaultysClaw can send QR invite emails to new users.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="SMTP Host"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          placeholder="smtp.example.com"
        />
        <Field
          label="Port"
          value={port}
          onChange={(e) => setPort(e.target.value)}
          placeholder="587"
        />
        <Field
          label="Username"
          value={user}
          onChange={(e) => setUser(e.target.value)}
          placeholder="user@example.com"
        />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
        <div className="col-span-2">
          <Field
            label="From address"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="noreply@example.com"
          />
        </div>
      </div>

      {msg && (
        <p
          className={`text-xs px-3 py-2 rounded-xl border ${
            msg.type === "ok"
              ? "bg-success-50 border-success-300 text-success-700"
              : "bg-danger-50 border-danger-300 text-danger-600"
          }`}
        >
          {msg.text}
        </p>
      )}

      <StepFooter>
        <button
          type="button"
          onClick={test}
          disabled={testing || !host}
          className="flex items-center gap-1.5 px-4 py-2 text-sm border border-neutral-200 text-foreground-500 hover:text-foreground hover:bg-background-200 rounded-xl disabled:opacity-40 transition-colors"
        >
          {testing ? (
            <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <Mail className="w-3.5 h-3.5" />
          )}
          Test
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-1.5 px-5 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-xl disabled:opacity-40 transition-colors"
        >
          {saving && (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          )}
          Save & Continue
        </button>
      </StepFooter>
    </form>
  );
}
