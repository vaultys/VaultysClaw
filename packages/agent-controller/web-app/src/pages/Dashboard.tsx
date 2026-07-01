import { useState, useEffect, useCallback, useRef } from "react";
import { useAgentData } from "../hooks/useAgentData";
import { useTheme, type Theme } from "../hooks/useTheme";
import AgentOverview from "./AgentOverview";
import RunsPanel from "./RunsPanel";
import ChatPanel from "./ChatPanel";
import type {
  AgentInfo,
  AgentStatus,
  LogEntry,
  LlmConfigSafe,
  ToolEntry,
  SkillEntry,
  SkillToolEntry,
  SchemaField,
  TaskEntry,
  ScheduleEntry,
  MemoryEntry,
  ToolLogEntry,
  ApprovalEntry,
} from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NavId =
  | "agent"
  | "chat"
  | "runs"
  | "tools"
  | "memory"
  | "tasks"
  | "logs"
  | "settings";

// ---------------------------------------------------------------------------
// SVG icons
// ---------------------------------------------------------------------------

function SvgIcon({
  d,
  className = "w-4 h-4",
}: {
  d: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={d} />
    </svg>
  );
}

const ICONS: Record<NavId, string> = {
  agent: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  chat: "M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z",
  runs: "M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347c-.75.412-1.667-.13-1.667-.986V5.653z",
  tools:
    "M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z",
  memory:
    "M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 6c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125",
  tasks: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z",
  logs: "M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z",
  settings:
    "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
};

const NAV_ITEMS: Array<{ id: NavId; label: string }> = [
  { id: "agent", label: "Agent" },
  { id: "chat", label: "Chat" },
  { id: "runs", label: "Runs" },
  { id: "tools", label: "Tools" },
  { id: "memory", label: "Memory" },
  { id: "tasks", label: "Tasks" },
  { id: "logs", label: "Logs" },
  { id: "settings", label: "Settings" },
];

// ---------------------------------------------------------------------------
// TopBar
// ---------------------------------------------------------------------------

const STATUS_STYLE: Record<AgentStatus, { dot: string; text: string }> = {
  connected: { dot: "bg-success", text: "text-success" },
  connecting: { dot: "bg-attention animate-pulse", text: "text-attention" },
  pending_approval: { dot: "bg-info animate-pulse", text: "text-info" },
  disconnected: { dot: "bg-danger", text: "text-danger" },
  initializing: { dot: "bg-fg-dim", text: "text-fg-muted" },
};

// ---------------------------------------------------------------------------
// Theme toggle
// ---------------------------------------------------------------------------

function ThemeToggle({
  theme,
  setTheme,
}: {
  theme: Theme;
  setTheme: (t: Theme) => void;
}) {
  const options: Array<{ value: Theme; title: string; icon: React.ReactNode }> =
    [
      {
        value: "light",
        title: "Light",
        icon: (
          <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          >
            <circle cx="12" cy="12" r="5" />
            <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        ),
      },
      {
        value: "dark",
        title: "Dark",
        icon: (
          <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          >
            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
          </svg>
        ),
      },
      {
        value: "system",
        title: "System",
        icon: (
          <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          >
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
          </svg>
        ),
      },
    ];

  return (
    <div className="flex items-center gap-0.5 bg-canvas border border-border rounded-md p-0.5">
      {options.map(({ value, title, icon }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          title={title}
          className={`flex items-center justify-center w-6 h-6 rounded transition-colors ${
            theme === value
              ? "bg-canvas-overlay text-fg"
              : "text-fg-dim hover:text-fg-muted"
          }`}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}

interface TopBarProps {
  info: AgentInfo;
  sseConnected: boolean;
  onLogout: () => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
}

function TopBar({
  info,
  sseConnected,
  onLogout,
  theme,
  setTheme,
}: TopBarProps) {
  const { dot, text } = STATUS_STYLE[info.status] ?? STATUS_STYLE.initializing;
  const model =
    info.activeLlmProvider && info.activeLlmModel
      ? `${info.activeLlmProvider}/${info.activeLlmModel}`
      : null;
  return (
    <div className="flex items-center gap-3 px-4 h-10 bg-canvas-subtle border-b border-border flex-shrink-0">
      <div
        className={`w-2 h-2 rounded-full flex-shrink-0 ${sseConnected ? "bg-success" : "bg-fg-dim animate-pulse"}`}
        title={sseConnected ? "Live" : "Reconnecting…"}
      />
      <span className="text-fg font-bold text-sm">VaultysClaw</span>
      <span className="text-fg-dim">/</span>
      <span className="text-fg text-sm">{info.name}</span>
      <span className={`flex items-center gap-1.5 text-xs ${text}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        {info.status.replace(/_/g, " ")}
      </span>
      {model && (
        <code className="hidden sm:block text-fg-muted text-[11px] bg-canvas border border-border-muted px-1.5 py-0.5 rounded">
          {model}
        </code>
      )}
      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle theme={theme} setTheme={setTheme} />
        <button
          onClick={onLogout}
          className="px-2.5 py-0.5 text-fg-muted text-[11px] border border-border rounded hover:text-danger hover:border-danger transition-colors"
        >
          Log out
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

interface SidebarProps {
  activeNav: NavId;
  onNav: (id: NavId) => void;
  capabilities: string[];
  pendingRuns: number;
}

function Sidebar({
  activeNav,
  onNav,
  capabilities,
  pendingRuns,
}: SidebarProps) {
  return (
    <div className="w-44 flex-shrink-0 flex flex-col bg-canvas-subtle border-r border-border h-full overflow-y-auto">
      <nav className="p-2 space-y-0.5 flex-1">
        {NAV_ITEMS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => onNav(id)}
            className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left transition-colors ${
              activeNav === id
                ? "bg-canvas-overlay text-fg font-medium"
                : "text-fg-muted hover:text-fg hover:bg-canvas"
            }`}
          >
            <SvgIcon d={ICONS[id]} />
            <span className="text-xs">{label}</span>
            {id === "runs" && pendingRuns > 0 && (
              <span className="ml-auto text-[10px] bg-attention text-canvas px-1.5 py-0.5 rounded-full font-bold tabular-nums">
                {pendingRuns}
              </span>
            )}
          </button>
        ))}
      </nav>
      {capabilities.length > 0 && (
        <div className="p-2 border-t border-border-muted">
          <p className="text-[10px] text-fg-dim uppercase tracking-wide mb-1.5 px-1">
            Capabilities
          </p>
          <div className="flex flex-wrap gap-1">
            {capabilities.map((c) => (
              <span
                key={c}
                className="text-[10px] bg-canvas-overlay border border-border-muted text-info px-1.5 py-0.5 rounded"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel header
// ---------------------------------------------------------------------------

function PanelHeader({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="px-3 py-1.5 bg-canvas-subtle border-b border-border-muted text-[11px] font-bold text-fg-muted uppercase tracking-widest flex items-center flex-shrink-0">
      {title}
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pending Approvals Banner
// ---------------------------------------------------------------------------

function ApprovalsBanner() {
  const [approvals, setApprovals] = useState<ApprovalEntry[]>([]);

  useEffect(() => {
    const fetchApprovals = () =>
      fetch("/api/approvals")
        .then((r) => r.json())
        .then((d: { approvals?: ApprovalEntry[] }) =>
          setApprovals(d.approvals ?? [])
        )
        .catch(() => {});
    fetchApprovals();

    const es = new EventSource("/api/events");
    es.addEventListener("tool_approval_request", () => fetchApprovals());
    return () => es.close();
  }, []);

  const resolve = async (requestId: string, approved: boolean) => {
    await fetch(`/api/approvals/${encodeURIComponent(requestId)}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved }),
    });
    setApprovals((prev) => prev.filter((a) => a.requestId !== requestId));
  };

  if (approvals.length === 0) return null;

  return (
    <div className="flex-shrink-0 border-b border-attention bg-attention-subtle px-4 py-2 space-y-1.5">
      {approvals.map((a) => (
        <div key={a.requestId} className="flex items-center gap-3 text-xs">
          <span className="text-attention font-bold">&#x26A0;</span>
          <span className="text-fg">
            Tool approval required:{" "}
            <code className="text-accent font-mono">{a.toolName}</code>
          </span>
          <code className="text-fg-muted text-[10px] hidden sm:block truncate max-w-xs">
            {JSON.stringify(a.args).slice(0, 80)}
          </code>
          <div className="ml-auto flex gap-1.5 flex-shrink-0">
            <button
              onClick={() => resolve(a.requestId, true)}
              className="px-2.5 py-0.5 text-[10px] bg-success-emphasis text-white rounded hover:opacity-90 transition-opacity"
            >
              Approve
            </button>
            <button
              onClick={() => resolve(a.requestId, false)}
              className="px-2.5 py-0.5 text-[10px] bg-danger-emphasis text-white rounded hover:opacity-90 transition-opacity"
            >
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Log Panel
// ---------------------------------------------------------------------------

const LOG_COLOR: Record<string, string> = {
  info: "text-success",
  warn: "text-attention",
  error: "text-danger",
  debug: "text-fg-dim",
};

function LogPanel({ logs }: { logs: ReturnType<typeof useAgentData>["logs"] }) {
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <PanelHeader title="Agent Logs" />
      <div className="flex flex-col-reverse flex-1 overflow-y-auto">
        <div className="flex flex-col gap-px p-2">
          {logs.length === 0 && (
            <p className="text-fg-dim text-xs p-2">No logs yet.</p>
          )}
          {logs.map((e, i) => (
            <div key={i} className="flex gap-2 leading-5 font-mono text-[11px]">
              <span className="text-fg-dim flex-shrink-0">
                {e.ts.slice(11, 19)}
              </span>
              <span
                className={`font-bold flex-shrink-0 ${LOG_COLOR[e.level] ?? "text-fg"}`}
              >
                [{e.level.toUpperCase()}]
              </span>
              <span className="text-fg break-words whitespace-pre-wrap min-w-0">
                {e.message}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Schema display helpers
// ---------------------------------------------------------------------------

function SchemaTypeTag({ field }: { field: SchemaField }) {
  const color: Record<string, string> = {
    string: "text-success",
    number: "text-info",
    boolean: "text-attention",
    array: "text-accent",
    object: "text-fg",
    enum: "text-attention",
  };
  const label = field.optional ? `${field.type}?` : field.type;
  return (
    <span
      className={`font-mono text-[10px] ${color[field.type] ?? "text-fg-muted"}`}
    >
      {label}
    </span>
  );
}

function SchemaTable({ schema }: { schema: Record<string, SchemaField> }) {
  return (
    <table className="w-full text-xs mt-1.5">
      <thead>
        <tr className="text-fg-dim text-[10px] border-b border-border-muted">
          <th className="text-left pb-1 pr-2 font-normal">param</th>
          <th className="text-left pb-1 pr-2 font-normal">type</th>
          <th className="text-left pb-1 font-normal">description</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(schema).map(([key, field]) => (
          <tr key={key} className="border-b border-border-muted last:border-0">
            <td className="py-1 pr-2 font-mono text-accent">{key}</td>
            <td className="py-1 pr-2">
              <SchemaTypeTag field={field} />
            </td>
            <td className="py-1 text-fg-muted">{field.description ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// Tool Invoke Modal
// ---------------------------------------------------------------------------

interface InvokeModalProps {
  tool: ToolEntry | SkillToolEntry;
  onClose: () => void;
}

function InvokeModal({ tool, onClose }: InvokeModalProps) {
  const schema = tool.inputSchema ?? {};
  const [args, setArgs] = useState<Record<string, string>>(
    Object.fromEntries(Object.keys(schema).map((k) => [k, ""]))
  );
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invoke = async () => {
    setLoading(true);
    setResult(null);
    setError(null);
    const parsed: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(args)) {
      const fieldType = schema[key]?.type;
      if (fieldType === "number") {
        parsed[key] = parseFloat(raw);
      } else if (fieldType === "boolean") {
        parsed[key] = raw === "true" || raw === "1";
      } else {
        // Try JSON parse for complex types, fall back to string
        try {
          parsed[key] = JSON.parse(raw);
        } catch {
          parsed[key] = raw;
        }
      }
    }
    try {
      const res = await fetch("/api/tools/invoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolName: tool.name, args: parsed }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        result?: unknown;
        error?: string;
      };
      if (!res.ok || data.error) {
        setError(data.error ?? "Unknown error");
      } else {
        setResult(JSON.stringify(data.result, null, 2));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-canvas border border-border rounded-lg shadow-xl w-full max-w-lg mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2.5 bg-canvas-subtle border-b border-border-muted">
          <div>
            <span className="text-[10px] text-fg-muted uppercase tracking-widest">
              Invoke Tool
            </span>
            <code className="block text-accent font-mono text-sm mt-0.5">
              {tool.name}
            </code>
          </div>
          <button
            onClick={onClose}
            className="text-fg-muted hover:text-fg text-lg leading-none"
          >
            &#x2715;
          </button>
        </div>
        <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {tool.description && (
            <p className="text-xs text-fg-muted">{tool.description}</p>
          )}
          {Object.keys(schema).length === 0 ? (
            <p className="text-xs text-fg-dim">
              This tool takes no parameters.
            </p>
          ) : (
            Object.entries(schema).map(([key, field]) => (
              <div key={key}>
                <label className="flex items-center gap-1.5 text-[10px] text-fg-muted uppercase tracking-wide mb-0.5">
                  <span className="font-mono text-accent">{key}</span>
                  <SchemaTypeTag field={field} />
                  {field.optional && (
                    <span className="text-fg-dim">(optional)</span>
                  )}
                </label>
                {field.enum ? (
                  <select
                    value={args[key] ?? ""}
                    onChange={(e) =>
                      setArgs((p) => ({ ...p, [key]: e.target.value }))
                    }
                    className="w-full bg-canvas border border-border-muted rounded px-2 py-1 text-xs text-fg outline-none focus:border-accent"
                  >
                    <option value="">— select —</option>
                    {field.enum.map((v) => (
                      <option key={String(v)} value={String(v)}>
                        {String(v)}
                      </option>
                    ))}
                  </select>
                ) : field.type === "boolean" ? (
                  <select
                    value={args[key] ?? ""}
                    onChange={(e) =>
                      setArgs((p) => ({ ...p, [key]: e.target.value }))
                    }
                    className="w-full bg-canvas border border-border-muted rounded px-2 py-1 text-xs text-fg outline-none focus:border-accent"
                  >
                    <option value="">—</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <input
                    type={field.type === "number" ? "number" : "text"}
                    value={args[key] ?? ""}
                    onChange={(e) =>
                      setArgs((p) => ({ ...p, [key]: e.target.value }))
                    }
                    placeholder={field.description ?? field.type}
                    className="w-full bg-canvas border border-border-muted rounded px-2 py-1 text-xs text-fg placeholder:text-fg-dim outline-none focus:border-accent font-mono"
                  />
                )}
              </div>
            ))
          )}

          {error && (
            <div className="rounded bg-danger-emphasis border border-danger px-3 py-2 text-danger text-xs">
              {error}
            </div>
          )}
          {result !== null && (
            <div>
              <p className="text-[10px] text-fg-muted uppercase tracking-wide mb-1">
                Result
              </p>
              <pre className="bg-canvas-subtle border border-border-muted rounded px-3 py-2 text-xs text-success font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
                {result}
              </pre>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-4 py-2.5 bg-canvas-subtle border-t border-border-muted">
          <button
            onClick={onClose}
            className="px-3 py-1 text-xs text-fg-muted border border-border rounded hover:text-fg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={invoke}
            disabled={loading}
            className="px-3 py-1 text-xs bg-accent-emphasis text-white rounded hover:bg-accent transition-colors disabled:opacity-50"
          >
            {loading ? "Running…" : "Run Tool"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tool card
// ---------------------------------------------------------------------------

function ToolCard({
  tool,
  onInvoke,
}: {
  tool: ToolEntry;
  onInvoke: (t: ToolEntry) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasSchema =
    tool.inputSchema && Object.keys(tool.inputSchema).length > 0;

  return (
    <div className="bg-canvas-subtle border border-border-muted rounded-md overflow-hidden">
      <div
        className={`flex items-start gap-3 px-3 py-2 ${hasSchema ? "cursor-pointer hover:bg-canvas" : ""}`}
        onClick={() => hasSchema && setExpanded((p) => !p)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-accent font-mono text-xs">{tool.name}</code>
            {tool.requiresApproval ? (
              <span className="text-[10px] bg-attention-emphasis text-attention border border-attention rounded px-1.5 py-0.5">
                &#x26A0; requires approval
              </span>
            ) : (
              <span className="text-[10px] text-success">auto-execute</span>
            )}
            {hasSchema && (
              <span className="text-[10px] text-fg-dim">
                {Object.keys(tool.inputSchema!).length} params
              </span>
            )}
          </div>
          {tool.description && (
            <p className="text-fg-muted text-[11px] mt-0.5 leading-relaxed">
              {tool.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onInvoke(tool);
            }}
            className="px-2 py-0.5 text-[10px] border border-border-muted text-fg-muted rounded hover:text-accent hover:border-accent transition-colors"
          >
            Invoke
          </button>
          {hasSchema && (
            <span className="text-fg-dim text-[10px]">
              {expanded ? "▲" : "▼"}
            </span>
          )}
        </div>
      </div>
      {expanded && hasSchema && (
        <div className="border-t border-border-muted px-3 pb-2">
          <SchemaTable schema={tool.inputSchema!} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skill card
// ---------------------------------------------------------------------------

function SkillCard({
  skill,
  onInvoke,
  onToggle,
}: {
  skill: SkillEntry;
  onInvoke: (t: SkillToolEntry) => void;
  onToggle: (name: string, enabled: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (skill.workspaceManaged && skill.isRequired) return;
    setToggling(true);
    try {
      await fetch(`/api/skills/${encodeURIComponent(skill.name)}/enabled`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !skill.enabled }),
      });
      onToggle(skill.name, !skill.enabled);
    } finally {
      setToggling(false);
    }
  };

  return (
    <div
      className={`bg-canvas-subtle border rounded-md overflow-hidden ${skill.enabled ? "border-border-muted" : "border-border opacity-60"}`}
    >
      <div
        className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-canvas"
        onClick={() => setExpanded((p) => !p)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-accent font-mono text-xs font-medium">
              {skill.name}
            </span>
            <span className="text-fg-dim text-[10px]">v{skill.version}</span>
            {skill.workspaceManaged && (
              <span className="text-[10px] bg-info-subtle border border-info text-info rounded px-1.5 py-0.5">
                workspace
              </span>
            )}
            {skill.isRequired && (
              <span className="text-[10px] bg-attention-subtle border border-attention text-attention rounded px-1.5 py-0.5">
                required
              </span>
            )}
            <span className="ml-auto text-fg-muted text-[10px]">
              {skill.toolCount} tools
            </span>
          </div>
          <p className="text-fg-muted text-[11px] mt-0.5">
            {skill.description}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!skill.isRequired && (
            <button
              onClick={handleToggle}
              disabled={toggling}
              title={
                skill.workspaceManaged
                  ? "Managed by workspace"
                  : skill.enabled
                    ? "Disable skill"
                    : "Enable skill"
              }
              className={`px-2 py-0.5 text-[10px] rounded border transition-colors disabled:opacity-50 ${
                skill.enabled
                  ? "border-success text-success hover:bg-danger-subtle hover:text-danger hover:border-danger"
                  : "border-fg-dim text-fg-muted hover:bg-success-subtle hover:text-success hover:border-success"
              } ${skill.workspaceManaged ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {skill.enabled ? "On" : "Off"}
            </button>
          )}
          <span className="text-fg-dim text-[10px]">
            {expanded ? "▲" : "▼"}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border-muted px-3 pb-2 space-y-1.5 pt-1.5">
          {skill.systemPromptExtension && (
            <div className="bg-canvas border border-border-muted rounded px-2.5 py-1.5 mb-2">
              <p className="text-[10px] text-fg-muted uppercase tracking-wide mb-0.5">
                System prompt extension
              </p>
              <p className="text-[11px] text-fg-muted italic">
                {skill.systemPromptExtension}
              </p>
            </div>
          )}
          {skill.tools.length === 0 ? (
            <p className="text-fg-dim text-xs py-2">No tools</p>
          ) : (
            skill.tools.map((t) => {
              const hasSchema =
                t.inputSchema && Object.keys(t.inputSchema).length > 0;
              const isOpen = expandedTool === t.name;
              return (
                <div
                  key={t.name}
                  className="bg-canvas border border-border-muted rounded overflow-hidden"
                >
                  <div
                    className={`flex items-start gap-2 px-2.5 py-1.5 ${hasSchema ? "cursor-pointer hover:bg-canvas-subtle" : ""}`}
                    onClick={() =>
                      hasSchema && setExpandedTool(isOpen ? null : t.name)
                    }
                  >
                    <div className="flex-1 min-w-0">
                      <code className="text-accent font-mono text-[11px]">
                        {t.name}
                      </code>
                      {t.description && (
                        <p className="text-fg-dim text-[10px] mt-0.5">
                          {t.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onInvoke(t);
                        }}
                        className="px-1.5 py-0.5 text-[10px] border border-border-muted text-fg-muted rounded hover:text-accent hover:border-accent transition-colors"
                      >
                        Invoke
                      </button>
                      {hasSchema && (
                        <span className="text-fg-dim text-[10px]">
                          {isOpen ? "▲" : "▼"}
                        </span>
                      )}
                    </div>
                  </div>
                  {isOpen && hasSchema && (
                    <div className="border-t border-border-muted px-2.5 pb-1.5">
                      <SchemaTable schema={t.inputSchema!} />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tools Panel
// ---------------------------------------------------------------------------

function ToolsPanel() {
  const [tools, setTools] = useState<ToolEntry[]>([]);
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [toolLog, setToolLog] = useState<ToolLogEntry[]>([]);
  const [view, setView] = useState<"tools" | "skills" | "log">("tools");
  const [invokeTarget, setInvokeTarget] = useState<
    ToolEntry | SkillToolEntry | null
  >(null);

  const refresh = useCallback(async () => {
    const [tRes, sRes, lRes] = await Promise.all([
      fetch("/api/tools")
        .then((r) => r.json())
        .catch(() => ({ tools: [] })),
      fetch("/api/skills")
        .then((r) => r.json())
        .catch(() => ({ skills: [] })),
      fetch("/api/tool-log")
        .then((r) => r.json())
        .catch(() => ({ entries: [] })),
    ]);
    setTools(tRes.tools ?? []);
    setSkills(sRes.skills ?? []);
    setToolLog(lRes.entries ?? []);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const byCapability = tools.reduce<Record<string, ToolEntry[]>>((acc, t) => {
    (acc[t.capability] ??= []).push(t);
    return acc;
  }, {});

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {invokeTarget && (
        <InvokeModal
          tool={invokeTarget}
          onClose={() => setInvokeTarget(null)}
        />
      )}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-muted bg-canvas-subtle flex-shrink-0">
        {(["tools", "skills", "log"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${
              view === v
                ? "bg-accent text-white"
                : "text-fg-muted hover:text-fg"
            }`}
          >
            {v === "log"
              ? "Usage Log"
              : v === "tools"
                ? `Tools (${tools.length})`
                : `Skills (${skills.length})`}
          </button>
        ))}
        <button
          onClick={refresh}
          className="ml-auto text-xs text-fg-muted hover:text-fg"
          title="Refresh"
        >
          &#x21BB;
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {view === "tools" &&
          (tools.length === 0 ? (
            <p className="text-fg-dim text-xs py-8 text-center">
              No tools registered. Capabilities determine which tools are
              available.
            </p>
          ) : (
            <div className="space-y-5">
              {Object.entries(byCapability).map(([cap, capTools]) => (
                <div key={cap}>
                  <p className="text-[10px] text-fg-muted uppercase tracking-widest font-bold mb-2 pb-1 border-b border-border-muted">
                    {cap}
                  </p>
                  <div className="space-y-1.5">
                    {capTools.map((t) => (
                      <ToolCard
                        key={t.name}
                        tool={t}
                        onInvoke={setInvokeTarget}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        {view === "skills" &&
          (skills.length === 0 ? (
            <p className="text-fg-dim text-xs py-8 text-center">
              No skills loaded. Place plugins in ~/.vaultysclaw/skills/
            </p>
          ) : (
            <div className="space-y-2">
              {skills.map((s) => (
                <SkillCard
                  key={s.name}
                  skill={s}
                  onInvoke={setInvokeTarget}
                  onToggle={(name, enabled) =>
                    setSkills((prev) =>
                      prev.map((sk) =>
                        sk.name === name ? { ...sk, enabled } : sk
                      )
                    )
                  }
                />
              ))}
            </div>
          ))}
        {view === "log" &&
          (toolLog.length === 0 ? (
            <p className="text-fg-dim text-xs py-8 text-center">
              No tool executions recorded yet.
            </p>
          ) : (
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="text-fg-muted border-b border-border-muted">
                  <th className="pb-1 pr-3">Time</th>
                  <th className="pb-1 pr-3">Tool</th>
                  <th className="pb-1 pr-3">Status</th>
                  <th className="pb-1">Duration</th>
                </tr>
              </thead>
              <tbody>
                {toolLog.map((e, i) => (
                  <tr key={i} className="border-b border-border-muted">
                    <td className="py-1 pr-3 text-fg-muted">
                      {new Date(e.created_at).toLocaleTimeString()}
                    </td>
                    <td className="py-1 pr-3 text-accent">{e.tool_name}</td>
                    <td
                      className={`py-1 pr-3 ${e.success ? "text-success" : "text-danger"}`}
                    >
                      {e.success ? "OK" : "FAIL"}
                    </td>
                    <td className="py-1 text-fg-muted tabular-nums">
                      {e.duration_ms}ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tasks Panel
// ---------------------------------------------------------------------------

function TasksPanel() {
  const [tasks, setTasks] = useState<TaskEntry[]>([]);
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [view, setView] = useState<"tasks" | "schedules">("tasks");
  const [newAction, setNewAction] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newSchedule, setNewSchedule] = useState({
    name: "",
    cron: "",
    action: "",
  });
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [tRes, sRes] = await Promise.all([
      fetch("/api/tasks")
        .then((r) => r.json())
        .catch(() => ({ tasks: [] })),
      fetch("/api/schedules")
        .then((r) => r.json())
        .catch(() => ({ schedules: [] })),
    ]);
    setTasks(tRes.tasks ?? []);
    setSchedules(sRes.schedules ?? []);
  }, []);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 3000);
    return () => clearInterval(iv);
  }, [refresh]);

  useEffect(() => {
    const es = new EventSource("/api/events");
    es.addEventListener("task_update", () => refresh());
    return () => es.close();
  }, [refresh]);

  const enqueue = async () => {
    if (!newAction.trim()) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: newAction }),
    });
    setNewAction("");
    refresh();
  };

  const createSchedule = async () => {
    setScheduleError(null);
    if (
      !newSchedule.name.trim() ||
      !newSchedule.cron.trim() ||
      !newSchedule.action.trim()
    ) {
      setScheduleError("Name, cron, and action are required");
      return;
    }
    const res = await fetch("/api/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: `schedule-${Date.now()}`,
        name: newSchedule.name.trim(),
        cron: newSchedule.cron.trim(),
        action: newSchedule.action.trim(),
      }),
    });
    if (!res.ok) {
      const d = (await res
        .json()
        .catch(() => ({ error: "Unknown error" }))) as { error: string };
      setScheduleError(d.error);
      return;
    }
    setNewSchedule({ name: "", cron: "", action: "" });
    refresh();
  };

  const statusColor: Record<string, string> = {
    pending: "text-fg-muted",
    running: "text-info",
    success: "text-success",
    failed: "text-danger",
    dead: "text-danger",
  };

  const truncate = (s: string | null, max = 80) =>
    !s ? "—" : s.length > max ? s.slice(0, max) + "…" : s;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-muted bg-canvas-subtle flex-shrink-0">
        {(["tasks", "schedules"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${
              view === v
                ? "bg-accent text-white"
                : "text-fg-muted hover:text-fg"
            }`}
          >
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
        <button
          onClick={refresh}
          className="ml-auto text-xs text-fg-muted hover:text-fg"
        >
          &#x21BB;
        </button>
      </div>
      {view === "tasks" && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex gap-2 p-2 border-b border-border-muted flex-shrink-0">
            <input
              value={newAction}
              onChange={(e) => setNewAction(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && enqueue()}
              placeholder="Action to enqueue as Agent.generate() task…"
              className="flex-1 px-2 py-1 text-xs bg-canvas border border-border-muted rounded text-fg placeholder:text-fg-dim outline-none focus:border-accent"
            />
            <button
              onClick={enqueue}
              className="px-3 py-1 text-xs bg-accent text-white rounded hover:opacity-90"
            >
              Enqueue
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 font-mono text-xs">
            <table className="w-full text-left">
              <thead>
                <tr className="text-fg-muted border-b border-border-muted">
                  <th className="pb-1 pr-2">Action</th>
                  <th className="pb-1 pr-2">Status</th>
                  <th className="pb-1 pr-2">Retries</th>
                  <th className="pb-1 pr-2">Result</th>
                  <th className="pb-1">Created</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <>
                    <tr
                      key={t.id}
                      className="border-b border-border-muted cursor-pointer hover:bg-canvas-subtle"
                      onClick={() =>
                        setExpandedId(expandedId === t.id ? null : t.id)
                      }
                    >
                      <td className="py-1 pr-2 text-accent">{t.action}</td>
                      <td
                        className={`py-1 pr-2 ${statusColor[t.status] ?? ""}`}
                      >
                        {t.status === "running" && (
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-info animate-pulse mr-1" />
                        )}
                        {t.status}
                      </td>
                      <td className="py-1 pr-2 tabular-nums">
                        {t.retry_count}/{t.max_retries}
                      </td>
                      <td className="py-1 pr-2 text-fg-muted">
                        {t.error ? (
                          <span className="text-danger">
                            {truncate(t.error)}
                          </span>
                        ) : (
                          truncate(t.result)
                        )}
                      </td>
                      <td className="py-1">
                        {new Date(t.created_at).toLocaleString()}
                      </td>
                    </tr>
                    {expandedId === t.id && (
                      <tr key={`${t.id}-d`}>
                        <td
                          colSpan={5}
                          className="p-3 bg-canvas-subtle border-b border-border-muted"
                        >
                          <div className="space-y-1.5 text-xs">
                            <div>
                              <span className="text-fg-muted">ID: </span>
                              {t.id}
                            </div>
                            {t.started_at && (
                              <div>
                                <span className="text-fg-muted">Started: </span>
                                {new Date(t.started_at).toLocaleString()}
                              </div>
                            )}
                            {t.completed_at && (
                              <div>
                                <span className="text-fg-muted">
                                  Completed:{" "}
                                </span>
                                {new Date(t.completed_at).toLocaleString()}
                              </div>
                            )}
                            {t.error && (
                              <div>
                                <span className="text-danger font-bold">
                                  Error:{" "}
                                </span>
                                <pre className="mt-1 whitespace-pre-wrap text-danger">
                                  {t.error}
                                </pre>
                              </div>
                            )}
                            {t.result && (
                              <div>
                                <span className="text-fg-muted font-bold">
                                  Result:{" "}
                                </span>
                                <pre className="mt-1 whitespace-pre-wrap text-fg bg-canvas rounded p-2 border border-border-muted max-h-48 overflow-y-auto">
                                  {(() => {
                                    try {
                                      return JSON.stringify(
                                        JSON.parse(t.result),
                                        null,
                                        2
                                      );
                                    } catch {
                                      return t.result;
                                    }
                                  })()}
                                </pre>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {tasks.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-fg-muted text-center">
                      No tasks
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {view === "schedules" && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex gap-2 p-2 border-b border-border-muted flex-shrink-0 flex-wrap">
            <input
              value={newSchedule.name}
              onChange={(e) =>
                setNewSchedule((p) => ({ ...p, name: e.target.value }))
              }
              placeholder="Name"
              className="w-28 px-2 py-1 text-xs bg-canvas border border-border-muted rounded text-fg placeholder:text-fg-dim outline-none focus:border-accent"
            />
            <input
              value={newSchedule.cron}
              onChange={(e) =>
                setNewSchedule((p) => ({ ...p, cron: e.target.value }))
              }
              placeholder="0 * * * * (cron)"
              className="w-40 px-2 py-1 text-xs bg-canvas border border-border-muted rounded text-fg placeholder:text-fg-dim outline-none focus:border-accent font-mono"
            />
            <input
              value={newSchedule.action}
              onChange={(e) =>
                setNewSchedule((p) => ({ ...p, action: e.target.value }))
              }
              onKeyDown={(e) => e.key === "Enter" && createSchedule()}
              placeholder="Action / intent…"
              className="flex-1 px-2 py-1 text-xs bg-canvas border border-border-muted rounded text-fg placeholder:text-fg-dim outline-none focus:border-accent"
            />
            <button
              onClick={createSchedule}
              className="px-3 py-1 text-xs bg-accent text-white rounded hover:opacity-90"
            >
              Add
            </button>
            {scheduleError && (
              <span className="w-full text-[10px] text-danger">
                {scheduleError}
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-3 font-mono text-xs">
            <table className="w-full text-left">
              <thead>
                <tr className="text-fg-muted border-b border-border-muted">
                  <th className="pb-1 pr-2">Name</th>
                  <th className="pb-1 pr-2">Cron</th>
                  <th className="pb-1 pr-2">Action</th>
                  <th className="pb-1 pr-2">Enabled</th>
                  <th className="pb-1 pr-2">Last Run</th>
                  <th className="pb-1"></th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((s) => (
                  <tr key={s.id} className="border-b border-border-muted">
                    <td className="py-1 pr-2 text-accent">{s.name}</td>
                    <td className="py-1 pr-2 font-mono">{s.cron}</td>
                    <td className="py-1 pr-2">{s.action}</td>
                    <td className="py-1 pr-2">{s.enabled ? "On" : "Off"}</td>
                    <td className="py-1 pr-2">
                      {s.last_run ? new Date(s.last_run).toLocaleString() : "—"}
                    </td>
                    <td className="py-1">
                      <button
                        onClick={async () => {
                          await fetch(
                            `/api/schedules/${encodeURIComponent(s.id)}`,
                            { method: "DELETE" }
                          );
                          refresh();
                        }}
                        className="text-danger hover:underline text-[10px]"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {schedules.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-fg-muted text-center">
                      No schedules
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Memory Panel
// ---------------------------------------------------------------------------

function MemoryPanel() {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [query, setQuery] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newType, setNewType] = useState<MemoryEntry["type"]>("fact");

  const refresh = useCallback(async (q?: string) => {
    const params = new URLSearchParams();
    if (q?.trim()) params.set("q", q);
    const res = await fetch(`/api/memory?${params}`)
      .then((r) => r.json())
      .catch(() => ({ memories: [] }));
    setMemories(res.memories ?? []);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = async () => {
    if (!newContent.trim()) return;
    await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newContent, type: newType }),
    });
    setNewContent("");
    refresh(query);
  };

  const remove = async (id: string) => {
    await fetch(`/api/memory/${encodeURIComponent(id)}`, { method: "DELETE" });
    refresh(query);
  };

  const typeColor: Record<string, string> = {
    fact: "text-info",
    procedure: "text-accent",
    preference: "text-attention",
    conversation_summary: "text-fg-muted",
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex gap-2 p-2 border-b border-border-muted bg-canvas-subtle flex-shrink-0">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && refresh(query)}
          placeholder="Search agent memory…"
          className="flex-1 px-2 py-1 text-xs bg-canvas border border-border-muted rounded text-fg placeholder:text-fg-dim outline-none focus:border-accent"
        />
        <button
          onClick={() => refresh(query)}
          className="px-3 py-1 text-xs bg-accent text-white rounded hover:opacity-90"
        >
          Search
        </button>
      </div>
      <div className="flex gap-2 p-2 border-b border-border-muted flex-shrink-0">
        <select
          value={newType}
          onChange={(e) => setNewType(e.target.value as MemoryEntry["type"])}
          className="px-2 py-1 text-xs bg-canvas border border-border-muted rounded text-fg outline-none"
        >
          <option value="fact">Fact</option>
          <option value="procedure">Procedure</option>
          <option value="preference">Preference</option>
        </select>
        <input
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="Add a memory for the agent…"
          className="flex-1 px-2 py-1 text-xs bg-canvas border border-border-muted rounded text-fg placeholder:text-fg-dim outline-none focus:border-accent"
        />
        <button
          onClick={save}
          className="px-3 py-1 text-xs bg-accent text-white rounded hover:opacity-90"
        >
          Save
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-2">
        {memories.map((m) => (
          <div
            key={m.id}
            className="p-2.5 border border-border-muted rounded-md bg-canvas-subtle"
          >
            <div className="flex justify-between items-start">
              <span
                className={`text-[10px] uppercase font-bold ${typeColor[m.type] ?? ""}`}
              >
                {m.type}
              </span>
              <div className="flex gap-2 items-center">
                <span className="text-fg-muted text-[10px]">
                  {new Date(m.created_at).toLocaleString()}
                </span>
                <button
                  onClick={() => remove(m.id)}
                  className="text-danger text-[10px] hover:underline"
                >
                  &#x2715;
                </button>
              </div>
            </div>
            <p className="mt-1 text-fg text-xs leading-relaxed">{m.content}</p>
            {m.tags && (
              <p className="mt-1 text-fg-muted text-[10px]">tags: {m.tags}</p>
            )}
          </div>
        ))}
        {memories.length === 0 && (
          <p className="text-fg-muted text-center py-8">No memories found</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings Panel
// ---------------------------------------------------------------------------

const PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "ollama",
  "openai-compatible",
] as const;
type Provider = (typeof PROVIDERS)[number];
const inputCls =
  "bg-canvas border border-border rounded-md text-fg text-xs px-2 py-1.5 outline-none focus:border-accent w-full";
const labelCls =
  "text-[10px] text-fg-muted uppercase tracking-wide mb-0.5 block";

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

function SettingsPanel() {
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [isOk, setIsOk] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [cfg, setCfg] = useState({
    provider: "openai" as Provider,
    model: "",
    apiKey: "",
    baseUrl: "",
    systemPrompt: "",
    maxTokens: "",
  });

  useEffect(() => {
    fetch("/api/config/llm")
      .then((r) => r.json())
      .then((d: LlmConfigSafe & { none?: boolean }) => {
        if (!d.none) {
          setCfg((p) => ({
            ...p,
            provider: (d.provider as Provider) || "openai",
            model: d.model || "",
            baseUrl: d.baseUrl || "",
            systemPrompt: d.systemPrompt || "",
            maxTokens: d.maxTokens ? String(d.maxTokens) : "",
          }));
          setHasApiKey(d.hasApiKey ?? false);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const save = async () => {
    if (!cfg.model.trim()) {
      setStatusMsg("Model is required");
      setIsOk(false);
      return;
    }
    setSaving(true);
    setStatusMsg("Saving…");
    setIsOk(false);
    try {
      const body: Record<string, unknown> = {
        provider: cfg.provider,
        model: cfg.model.trim(),
      };
      if (cfg.apiKey.trim()) body.apiKey = cfg.apiKey.trim();
      if (cfg.baseUrl.trim()) body.baseUrl = cfg.baseUrl.trim();
      if (cfg.systemPrompt.trim()) body.systemPrompt = cfg.systemPrompt.trim();
      if (cfg.maxTokens.trim()) body.maxTokens = parseInt(cfg.maxTokens, 10);
      const r = await fetch("/api/config/llm", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        const { config } = (await r.json()) as { config: LlmConfigSafe };
        setHasApiKey(config?.hasApiKey ?? false);
        setCfg((p) => ({ ...p, apiKey: "" }));
        setStatusMsg("Saved ✓");
        setIsOk(true);
      } else {
        const e = (await r
          .json()
          .catch(() => ({ error: "Unknown error" }))) as { error: string };
        setStatusMsg(e.error);
        setIsOk(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setSaving(true);
    setStatusMsg("Clearing…");
    setIsOk(false);
    try {
      const r = await fetch("/api/config/llm", { method: "DELETE" });
      if (r.ok) {
        setCfg({
          provider: "openai",
          model: "",
          apiKey: "",
          baseUrl: "",
          systemPrompt: "",
          maxTokens: "",
        });
        setHasApiKey(false);
        setStatusMsg("Cleared ✓");
        setIsOk(true);
      } else {
        setStatusMsg("Error clearing config");
        setIsOk(false);
      }
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center flex-1">
        <div className="w-5 h-5 border-2 border-border border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-2xl space-y-6">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-fg-muted mb-4 pb-2 border-b border-border-muted">
            LLM Configuration
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Provider">
              <select
                value={cfg.provider}
                onChange={(e) =>
                  setCfg((p) => ({
                    ...p,
                    provider: e.target.value as Provider,
                  }))
                }
                className={inputCls}
              >
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Model">
              <input
                type="text"
                placeholder="gpt-4o, llama3.2, claude-sonnet-4…"
                value={cfg.model}
                onChange={(e) =>
                  setCfg((p) => ({ ...p, model: e.target.value }))
                }
                className={inputCls}
              />
            </FormField>
            <FormField
              label={hasApiKey ? "API Key (set — blank to keep)" : "API Key"}
            >
              <input
                type="password"
                placeholder={hasApiKey ? "Enter new key to update" : "sk-…"}
                value={cfg.apiKey}
                onChange={(e) =>
                  setCfg((p) => ({ ...p, apiKey: e.target.value }))
                }
                className={inputCls}
                autoComplete="new-password"
              />
            </FormField>
            <FormField label="Base URL (Ollama / OpenAI-compatible)">
              <input
                type="text"
                placeholder="http://localhost:11434"
                value={cfg.baseUrl}
                onChange={(e) =>
                  setCfg((p) => ({ ...p, baseUrl: e.target.value }))
                }
                className={inputCls}
              />
            </FormField>
            <FormField label="Max Output Tokens">
              <input
                type="number"
                placeholder="4096"
                min={1}
                value={cfg.maxTokens}
                onChange={(e) =>
                  setCfg((p) => ({ ...p, maxTokens: e.target.value }))
                }
                className={inputCls}
              />
            </FormField>
          </div>
          <div className="mt-4">
            <FormField label="Agent Instructions (system prompt)">
              <textarea
                rows={4}
                placeholder="You are VaultysClaw Agent, a secure AI agent controller…"
                value={cfg.systemPrompt}
                onChange={(e) =>
                  setCfg((p) => ({ ...p, systemPrompt: e.target.value }))
                }
                className={`${inputCls} resize-y`}
              />
            </FormField>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-1.5 bg-accent-emphasis text-white text-xs rounded-md hover:bg-accent transition-colors disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={clear}
              disabled={saving}
              className="px-3 py-1.5 bg-canvas-overlay border border-border text-fg-muted text-xs rounded-md hover:text-danger hover:border-danger transition-colors disabled:opacity-50"
            >
              Clear
            </button>
            {statusMsg && (
              <span
                className={`text-xs ${isOk ? "text-success" : "text-danger"}`}
              >
                {statusMsg}
              </span>
            )}
          </div>
        </div>
        <div className="bg-canvas-subtle border border-border-muted rounded-lg p-4 text-xs space-y-2">
          <p className="text-fg-muted font-bold uppercase text-[10px] tracking-wide mb-3">
            Mastra Model Specifier Reference
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono">
            {[
              ["openai/gpt-4o", "provider: openai"],
              ["anthropic/claude-sonnet-4", "provider: anthropic"],
              ["google/gemini-2.5-pro", "provider: google"],
              ["ollama/llama3.2", "provider: ollama + baseUrl"],
            ].map(([spec, hint]) => (
              <>
                <span key={spec} className="text-accent">
                  {spec}
                </span>
                <span className="text-fg-dim">{hint}</span>
              </>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard (main)
// ---------------------------------------------------------------------------

interface Props {
  did: string;
  onLogout: () => void;
}

export default function Dashboard({ did: _did, onLogout }: Props) {
  const { info, logs, intents, sseConnected } = useAgentData();
  const { theme, setTheme } = useTheme();
  const [activeNav, setActiveNav] = useState<NavId>("agent");

  const pendingRuns = intents.filter((i) => i.status === "pending").length;

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    onLogout();
  };

  if (!info) {
    return (
      <div className="flex items-center justify-center h-full bg-canvas">
        <div className="w-7 h-7 border-2 border-border border-t-info rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-canvas overflow-hidden">
      <TopBar
        info={info}
        sseConnected={sseConnected}
        onLogout={logout}
        theme={theme}
        setTheme={setTheme}
      />
      <ApprovalsBanner />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          activeNav={activeNav}
          onNav={setActiveNav}
          capabilities={info.capabilities}
          pendingRuns={pendingRuns}
        />
        <main className="flex-1 flex overflow-hidden">
          {activeNav === "agent" && (
            <AgentOverview info={info} intents={intents} />
          )}
          {activeNav === "chat" && <ChatPanel />}
          {activeNav === "runs" && <RunsPanel intents={intents} />}
          {activeNav === "tools" && <ToolsPanel />}
          {activeNav === "memory" && <MemoryPanel />}
          {activeNav === "tasks" && <TasksPanel />}
          {activeNav === "logs" && <LogPanel logs={logs} />}
          {activeNav === "settings" && <SettingsPanel />}
        </main>
      </div>
    </div>
  );
}
