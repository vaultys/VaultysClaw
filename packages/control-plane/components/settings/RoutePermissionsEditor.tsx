import { useState } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

interface RouteEntry {
  label: string;
  path: string;
  methods: HttpMethod[];
}

interface RouteGroup {
  name: string;
  routes: RouteEntry[];
}

const ROUTE_GROUPS: RouteGroup[] = [
  {
    name: "Agents",
    routes: [
      {
        label: "List / create agents",
        path: "/api/admin/agents",
        methods: ["GET", "POST"],
      },
      {
        label: "Agent detail",
        path: "/api/admin/agents/[did]",
        methods: ["GET", "PATCH", "DELETE"],
      },
      {
        label: "Run intent on agent",
        path: "/api/admin/agents/[did]/run",
        methods: ["POST"],
      },
      {
        label: "Agent task queue",
        path: "/api/admin/agents/[did]/task",
        methods: ["GET", "POST"],
      },
      {
        label: "Agent skills",
        path: "/api/admin/agents/[did]/skills",
        methods: ["GET", "POST"],
      },
      {
        label: "Agent token usage",
        path: "/api/admin/agents/[did]/token-usage",
        methods: ["GET"],
      },
      {
        label: "Agent schedules",
        path: "/api/admin/agents/[did]/schedules",
        methods: ["GET", "POST"],
      },
    ],
  },
  {
    name: "Workflows",
    routes: [
      {
        label: "List / create workflows",
        path: "/api/workflows",
        methods: ["GET", "POST"],
      },
      {
        label: "Workflow detail",
        path: "/api/workflows/[id]",
        methods: ["GET", "PATCH", "DELETE"],
      },
      {
        label: "Execute workflow",
        path: "/api/workflows/[id]/execute",
        methods: ["POST"],
      },
      { label: "Workflow runs", path: "/api/workflows/runs", methods: ["GET"] },
      {
        label: "Workflow approvals",
        path: "/api/workflows/approvals",
        methods: ["GET", "POST"],
      },
    ],
  },
  {
    name: "Channels",
    routes: [
      {
        label: "List / create channels",
        path: "/api/channels",
        methods: ["GET", "POST"],
      },
      {
        label: "Channel detail",
        path: "/api/channels/[id]",
        methods: ["GET", "PATCH", "DELETE"],
      },
      {
        label: "Channel messages",
        path: "/api/channels/[id]/messages",
        methods: ["GET", "POST"],
      },
      {
        label: "Channel members",
        path: "/api/channels/[id]/members",
        methods: ["GET", "POST", "DELETE"],
      },
    ],
  },
  {
    name: "Intents",
    routes: [
      { label: "List intents", path: "/api/intents", methods: ["GET", "POST"] },
    ],
  },
  {
    name: "Governance",
    routes: [
      {
        label: "Governance summary",
        path: "/api/admin/governance/summary",
        methods: ["GET"],
      },
      { label: "Audit log", path: "/api/admin/governance/audit", methods: ["GET"] },
    ],
  },
  {
    name: "Users",
    routes: [
      { label: "List users", path: "/api/admin/users", methods: ["GET"] },
      {
        label: "User detail",
        path: "/api/admin/users/[did]",
        methods: ["GET", "PATCH", "DELETE"],
      },
    ],
  },
  {
    name: "Models & Knowledge",
    routes: [
      { label: "Models", path: "/api/admin/models", methods: ["GET", "POST"] },
      {
        label: "Model detail",
        path: "/api/admin/models/[id]",
        methods: ["GET", "PATCH", "DELETE"],
      },
      {
        label: "Knowledge bases",
        path: "/api/admin/knowledge",
        methods: ["GET", "POST"],
      },
      {
        label: "Knowledge detail",
        path: "/api/admin/knowledge/[id]",
        methods: ["GET", "PATCH", "DELETE"],
      },
    ],
  },
];

const FULL_ACCESS_ENTRIES: string[] = [
  "GET *",
  "POST *",
  "PATCH *",
  "DELETE *",
];

export function isFullAccess(routes: string[]) {
  return (
    FULL_ACCESS_ENTRIES.every((e) => routes.includes(e)) &&
    routes.every((r) => FULL_ACCESS_ENTRIES.includes(r))
  );
}

function methodColor(m: HttpMethod) {
  return {
    GET: "bg-primary-100 border-primary-300 text-primary-700",
    POST: "bg-success-100 border-success-300 text-success-700",
    PATCH: "bg-warning-100 border-warning-300 text-warning-700",
    DELETE: "bg-danger-100 border-danger-300 text-danger-700",
  }[m];
}

function methodColorActive(m: HttpMethod) {
  return {
    GET: "bg-primary-600 text-white border-primary-600",
    POST: "bg-success-600 text-white border-success-600",
    PATCH: "bg-warning-600 text-white border-warning-600",
    DELETE: "bg-danger-600 text-white border-danger-600",
  }[m];
}

export function RoutePermissionsEditor({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [customEntry, setCustomEntry] = useState("");
  const [customMethod, setCustomMethod] = useState<HttpMethod>("GET");

  const toggle = (entry: string) => {
    onChange(
      value.includes(entry)
        ? value.filter((e) => e !== entry)
        : [...value, entry]
    );
  };

  const toggleFullAccess = () => {
    if (isFullAccess(value)) {
      onChange([]);
    } else {
      onChange(FULL_ACCESS_ENTRIES);
    }
  };

  const addCustom = () => {
    const path = customEntry.trim();
    if (!path) return;
    const entry = `${customMethod} ${path.startsWith("/") ? path : "/" + path}`;
    if (!value.includes(entry)) onChange([...value, entry]);
    setCustomEntry("");
  };

  const removeCustom = (entry: string) => {
    onChange(value.filter((e) => e !== entry));
  };

  // Known entries from the groups
  const knownEntries = new Set(
    ROUTE_GROUPS.flatMap((g) =>
      g.routes.flatMap((r) => r.methods.map((m) => `${m} ${r.path}`))
    )
  );
  const customEntries = value.filter(
    (e) => !knownEntries.has(e) && !FULL_ACCESS_ENTRIES.includes(e)
  );
  const full = isFullAccess(value);

  return (
    <div className="space-y-3">
      {/* Full access toggle */}
      <button
        type="button"
        onClick={toggleFullAccess}
        className={cn(
          "w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-medium transition",
          full
            ? "bg-primary-100 border-primary-400 text-primary-700"
            : "bg-background-100 border-neutral-300 text-foreground-500 hover:border-foreground-400"
        )}
      >
        <span>Full access (all methods, all routes)</span>
        <span
          className={cn(
            "w-4 h-4 rounded border flex items-center justify-center shrink-0",
            full ? "bg-primary-600 border-primary-600" : "border-neutral-400"
          )}
        >
          {full && <Check className="w-2.5 h-2.5 text-white" />}
        </span>
      </button>

      {!full && (
        <>
          {/* Grouped route checkboxes */}
          <div className="border border-neutral-300 rounded-lg overflow-hidden divide-y divide-neutral-200/60">
            {ROUTE_GROUPS.map((group) => (
              <div key={group.name}>
                <div className="px-3 py-1.5 bg-background-200/60 text-[10px] font-semibold uppercase tracking-wider text-foreground-400">
                  {group.name}
                </div>
                {group.routes.map((route) => (
                  <div
                    key={route.path}
                    className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-background-200/30"
                  >
                    <div className="min-w-0">
                      <p className="text-xs text-foreground">{route.label}</p>
                      <p className="font-mono text-[10px] text-foreground-400 truncate">
                        {route.path}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {route.methods.map((m) => {
                        const entry = `${m} ${route.path}`;
                        const active = value.includes(entry);
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => toggle(entry)}
                            className={cn(
                              "px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded border transition",
                              active
                                ? methodColorActive(m)
                                : methodColor(m) +
                                    " opacity-40 hover:opacity-80"
                            )}
                          >
                            {m}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Custom entries */}
          {customEntries.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {customEntries.map((e) => (
                <span
                  key={e}
                  className="flex items-center gap-1 px-2 py-0.5 bg-background-200 border border-neutral-300 rounded-full text-[11px] font-mono text-foreground-600"
                >
                  {e}
                  <button
                    type="button"
                    onClick={() => removeCustom(e)}
                    className="text-foreground-400 hover:text-danger-600"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Add custom route */}
          <div className="flex items-center gap-2">
            <select
              value={customMethod}
              onChange={(e) => setCustomMethod(e.target.value as HttpMethod)}
              className="bg-background-100 border border-neutral-300 rounded-lg px-2 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/50"
            >
              {(["GET", "POST", "PATCH", "DELETE"] as HttpMethod[]).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={customEntry}
              onChange={(e) => setCustomEntry(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustom();
                }
              }}
              placeholder="/api/custom/[id]/action"
              className="flex-1 bg-background-100 border border-neutral-300 rounded-lg px-3 py-1.5 text-xs font-mono text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
            />
            <button
              type="button"
              onClick={addCustom}
              disabled={!customEntry.trim()}
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-background-200 border border-neutral-300 hover:border-foreground-400 text-foreground disabled:opacity-40 transition"
            >
              Add
            </button>
          </div>
          <p className="text-[10px] text-foreground-400">
            Click method badges to toggle access. Add custom routes for unlisted
            endpoints.
          </p>
        </>
      )}

      {/* Summary */}
      {value.length > 0 && (
        <p className="text-[11px] text-foreground-400">
          {full
            ? "Full access granted"
            : `${value.length} permission${value.length === 1 ? "" : "s"} selected`}
        </p>
      )}
    </div>
  );
}
