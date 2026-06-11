"use client";

/**
 * SocialMediaTab — manage social-media credentials and scheduled posts for a realm.
 *
 * Placed inside the Realm detail page as the "Social Media" tab.
 *
 * Features:
 * - X (Twitter) credential management (saves encrypted via VaultysId vault)
 * - Session status display (tells users whether the agent has a live browser session)
 * - Daily post schedule configuration
 * - Quick "post now" for ad-hoc tweets
 */

import { useState, useEffect, useCallback } from "react";
import {
  Key,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
  Trash2,
  Clock,
  Send,
  Info,
} from "lucide-react";

/** Minimal X (Twitter) logo — lucide-react v1 removed the Twitter icon */
function XLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.259 5.631L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  );
}

interface Credential {
  id: string;
  service: string;
  name: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface SocialMediaTabProps {
  realmId: string;
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function CronPreview({ cron }: { cron: string }) {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5)
    return <span className="text-danger-500 text-xs">Invalid cron</span>;

  const [min, hour, , , dow] = parts;
  const days =
    dow === "*"
      ? "every day"
      : dow === "1-5"
        ? "Mon–Fri"
        : dow === "1-7" || dow === "0-6"
          ? "every day"
          : `day(s) ${dow}`;

  const time =
    min === "*" || hour === "*"
      ? "every minute"
      : `${String(parseInt(hour)).padStart(2, "0")}:${String(parseInt(min)).padStart(2, "0")} UTC`;

  return (
    <span className="text-xs text-foreground-500">
      Posts at <strong className="text-foreground">{time}</strong>, {days}
    </span>
  );
}

// -----------------------------------------------------------------------
// Main component
// -----------------------------------------------------------------------

export function SocialMediaTab({ realmId }: SocialMediaTabProps) {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);

  // X credential form
  const [xUsername, setXUsername] = useState("");
  const [xPassword, setXPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [savingCred, setSavingCred] = useState(false);
  const [credMsg, setCredMsg] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  // Schedule
  const [cronExpr, setCronExpr] = useState("0 9 * * 1-5");
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleMsg, setScheduleMsg] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  // Quick post
  const [postText, setPostText] = useState("");
  const [posting, setPosting] = useState(false);
  const [postMsg, setPostMsg] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/realms/${realmId}/credentials?service=x`);
      if (res.ok) {
        const data = (await res.json()) as { credentials: Credential[] };
        setCredentials(data.credentials);
      }
    } finally {
      setLoading(false);
    }
  }, [realmId]);

  useEffect(() => {
    load();
  }, [load]);

  // Derived
  const xCred = credentials.find(
    (c) => c.service === "x" && c.name === "session"
  );
  const hasXCred = Boolean(xCred);

  // ---- Actions -------------------------------------------------------

  async function saveXCredentials(e: React.FormEvent) {
    e.preventDefault();
    if (!xUsername.trim() || !xPassword.trim()) return;
    setSavingCred(true);
    setCredMsg(null);

    try {
      // Save username (not secret — just metadata) and password (secret)
      const res = await fetch(`/api/realms/${realmId}/credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service: "x",
          name: "session",
          secret: xPassword,
          metadata: { username: xUsername },
        }),
      });

      if (res.ok) {
        setCredMsg({ type: "ok", text: "X credentials saved and encrypted." });
        setXUsername("");
        setXPassword("");
        await load();
      } else {
        const err = (await res.json()) as { error?: string };
        setCredMsg({
          type: "err",
          text: err.error ?? "Failed to save credentials.",
        });
      }
    } finally {
      setSavingCred(false);
    }
  }

  async function deleteXCredential() {
    if (
      !confirm(
        "Delete X credentials? The agent will no longer be able to post."
      )
    )
      return;

    const res = await fetch(
      `/api/realms/${realmId}/credentials?service=x&name=session`,
      { method: "DELETE" }
    );

    if (res.ok) {
      setCredMsg({ type: "ok", text: "Credentials deleted." });
      await load();
    }
  }

  async function saveSchedule(e: React.FormEvent) {
    e.preventDefault();
    setSavingSchedule(true);
    setScheduleMsg(null);

    try {
      // Save schedule cron expression as a credential-like config
      const res = await fetch(`/api/realms/${realmId}/credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service: "x",
          name: "schedule",
          secret: cronExpr, // cron expression stored as the "secret" (not truly sensitive)
          metadata: { type: "schedule", cron: cronExpr },
        }),
      });

      if (res.ok) {
        setScheduleMsg({ type: "ok", text: "Schedule saved." });
        await load();
      } else {
        const err = (await res.json()) as { error?: string };
        setScheduleMsg({
          type: "err",
          text: err.error ?? "Failed to save schedule.",
        });
      }
    } finally {
      setSavingSchedule(false);
    }
  }

  async function postNow(e: React.FormEvent) {
    e.preventDefault();
    if (!postText.trim()) return;
    setPosting(true);
    setPostMsg(null);

    try {
      // Trigger a workflow or direct intent — for now we post via the agent tool
      // This endpoint doesn't exist yet; it will be wired in Phase 3
      const res = await fetch(`/api/realms/${realmId}/social-media/post`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: postText }),
      });

      if (res.ok) {
        const data = (await res.json()) as { tweetUrl?: string };
        setPostMsg({
          type: "ok",
          text: data.tweetUrl
            ? `Posted! ${data.tweetUrl}`
            : "Post dispatched to agent.",
        });
        setPostText("");
      } else {
        const err = (await res.json()) as { error?: string };
        setPostMsg({ type: "err", text: err.error ?? "Failed to post." });
      }
    } finally {
      setPosting(false);
    }
  }

  // ---- Render --------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* X Account Section */}
      <div className="bg-background-100 border border-neutral-200 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <XLogo className="w-4 h-4 text-primary-500" /> X (Twitter) Account
          </h3>
          {hasXCred && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-success-100 text-success-700 border border-success-300 font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Configured
            </span>
          )}
        </div>

        {hasXCred ? (
          /* Credential already saved — show summary */
          <div className="space-y-3">
            <div className="flex items-center gap-3 bg-background-200 border border-neutral-200 rounded-xl px-4 py-3">
              <Key className="w-4 h-4 text-foreground-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground font-medium">
                  {(xCred?.metadata?.username as string) ?? "X account"}
                </p>
                <p className="text-xs text-foreground-500">
                  Password stored encrypted · Last updated{" "}
                  {new Date(xCred?.updated_at ?? "").toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={deleteXCredential}
                className="p-1.5 rounded-lg text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20 transition-colors"
                title="Delete credentials"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* Session setup instructions */}
            <div className="flex gap-3 p-3 bg-warning-50 border border-warning-200 rounded-xl text-xs text-warning-800">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium">
                  One-time browser session setup required
                </p>
                <p>
                  The agent posts via browser automation. Ask the agent to run{" "}
                  <code className="bg-warning-100 px-1 py-0.5 rounded font-mono">
                    setup_x_session
                  </code>{" "}
                  once. It will open a browser window — log in to X and the
                  session will be saved automatically.
                </p>
              </div>
            </div>

            <button
              onClick={() => setCredMsg(null)}
              className="text-xs text-primary-600 hover:underline"
            >
              Update credentials
            </button>
          </div>
        ) : (
          /* Credential input form */
          <form onSubmit={saveXCredentials} className="space-y-3">
            <p className="text-xs text-foreground-500">
              Enter your X login credentials. They are encrypted with the
              server&apos;s VaultysId before storage — never stored in
              plaintext.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">
                  X Username / Email
                </label>
                <input
                  type="text"
                  value={xUsername}
                  onChange={(e) => setXUsername(e.target.value)}
                  placeholder="@handle or email"
                  className="w-full px-3 py-2 text-sm rounded-xl bg-background border border-neutral-200 text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={xPassword}
                    onChange={(e) => setXPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 pr-9 text-sm rounded-xl bg-background border border-neutral-200 text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-foreground-500 hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
            {credMsg && (
              <p
                className={`text-xs flex items-center gap-1.5 ${credMsg.type === "ok" ? "text-success-600" : "text-danger-500"}`}
              >
                {credMsg.type === "ok" ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5" />
                )}
                {credMsg.text}
              </p>
            )}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingCred || !xUsername || !xPassword}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
              >
                {savingCred ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Key className="w-3.5 h-3.5" />
                )}
                {savingCred ? "Saving…" : "Save Credentials"}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Schedule Section */}
      <div className="bg-background-100 border border-neutral-200 rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary-500" /> Daily Post Schedule
        </h3>
        <form onSubmit={saveSchedule} className="space-y-3">
          <p className="text-xs text-foreground-500">
            Configure when the agent automatically posts. Uses 5-field cron
            syntax (UTC).
          </p>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={cronExpr}
              onChange={(e) => setCronExpr(e.target.value)}
              placeholder="0 9 * * 1-5"
              className="w-52 px-3 py-2 text-sm rounded-xl bg-background border border-neutral-200 text-foreground font-mono placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
            />
            <div className="flex-1">
              <CronPreview cron={cronExpr} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              ["0 9 * * 1-5", "9 AM weekdays"],
              ["0 9 * * *", "9 AM daily"],
              ["0 9,17 * * 1-5", "9 AM + 5 PM weekdays"],
              ["0 12 * * *", "Noon daily"],
            ].map(([expr, label]) => (
              <button
                key={expr}
                type="button"
                onClick={() => setCronExpr(expr)}
                className={`px-3 py-1 text-xs rounded-lg border transition-colors ${
                  cronExpr === expr
                    ? "bg-primary-50 border-primary-300 text-primary-700"
                    : "bg-background-200 border-neutral-200 text-foreground-500 hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {scheduleMsg && (
            <p
              className={`text-xs flex items-center gap-1.5 ${scheduleMsg.type === "ok" ? "text-success-600" : "text-danger-500"}`}
            >
              {scheduleMsg.type === "ok" ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5" />
              )}
              {scheduleMsg.text}
            </p>
          )}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingSchedule}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {savingSchedule ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Clock className="w-3.5 h-3.5" />
              )}
              {savingSchedule ? "Saving…" : "Save Schedule"}
            </button>
          </div>
        </form>
      </div>

      {/* Quick post */}
      <div className="bg-background-100 border border-neutral-200 rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <XLogo className="w-4 h-4 text-primary-500" /> Post Now
        </h3>
        <form onSubmit={postNow} className="space-y-3">
          <p className="text-xs text-foreground-500">
            Dispatch a one-off tweet immediately via the realm&apos;s agent.
            Requires agent to be online and X session set up.
          </p>
          <div className="relative">
            <textarea
              value={postText}
              onChange={(e) => setPostText(e.target.value)}
              placeholder="What's happening?"
              maxLength={280}
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-xl bg-background border border-neutral-200 text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40 resize-none"
            />
            <span
              className={`absolute bottom-2.5 right-3 text-xs ${postText.length > 260 ? "text-warning-500" : "text-foreground-400"}`}
            >
              {postText.length} / 280
            </span>
          </div>
          {postMsg && (
            <p
              className={`text-xs flex items-center gap-1.5 break-all ${postMsg.type === "ok" ? "text-success-600" : "text-danger-500"}`}
            >
              {postMsg.type === "ok" ? (
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              )}
              {postMsg.text}
            </p>
          )}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={posting || !postText.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {posting ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              {posting ? "Posting…" : "Post to X"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
