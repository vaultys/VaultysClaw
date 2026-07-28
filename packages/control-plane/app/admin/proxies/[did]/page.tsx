"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Trash2,
  Loader2,
  LayoutDashboard,
  Server,
  ListFilter,
  Users,
  ScrollText,
  Plus,
  AlertTriangle,
  ClipboardCheck,
} from "lucide-react";
import { timeAgo } from "@vaultysclaw/shared";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import {
  useToolbar,
  type ToolbarAction,
} from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import { adminApi, unwrap } from "@/lib/api/ts-rest/client";
import { ChipMultiSelect } from "@/components/proxy/ChipMultiSelect";
import type {
  ProxyInfo,
  ProxyUpstream,
  ProxyRule,
  ProxyPrincipal,
  ProxyActivityLog,
} from "@/lib/contracts";

type Tab = "overview" | "upstreams" | "rules" | "principals" | "pending" | "logs";

const ALL_TABS: Tab[] = ["overview", "upstreams", "rules", "principals", "pending", "logs"];

// Seed vocabulary offered alongside whatever's already in use on this proxy —
// mirrors the platform's built-in agent capability names, since a governance
// rule is the same idea applied to proxied traffic instead of an agent.
const SEED_GOVERNANCE_RULES = [
  "file_access",
  "internet_access",
  "browser_control",
  "api_call",
  "mail_send",
  "code_execution",
  "system_command",
  "agent_communication",
  "knowledge_search",
];
const SEED_TAGS = ["ai_agent", "service"];

export default function ProxyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const did = decodeURIComponent(params.did as string);

  const tabParam = searchParams.get("tab") as Tab | null;
  const [activeTab, setActiveTab] = useState<Tab>(
    tabParam && ALL_TABS.includes(tabParam) ? tabParam : "overview"
  );
  const [proxy, setProxy] = useState<ProxyInfo | null>(null);
  const [upstreams, setUpstreams] = useState<ProxyUpstream[]>([]);
  const [rules, setRules] = useState<ProxyRule[]>([]);
  const [principals, setPrincipals] = useState<ProxyPrincipal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [p, u, r, pr] = await Promise.all([
        unwrap(await adminApi.proxies.getProxy({ params: { did } })),
        unwrap(await adminApi.proxies.listUpstreams({ params: { did } })),
        unwrap(await adminApi.proxies.listRules({ params: { did } })),
        unwrap(await adminApi.proxies.listPrincipals({ params: { did } })),
      ]);
      setProxy(p);
      setUpstreams(u);
      setRules(r);
      setPrincipals(pr);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch proxy");
    } finally {
      setLoading(false);
    }
  }, [did]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Autocomplete vocabulary for the tag/governance-rule editors — whatever's
  // already in use on this proxy, plus a seed list of common names, shared
  // between the Principals and Pending tabs so suggestions stay consistent.
  const tagSuggestions = useMemo(() => {
    const used = principals.map((p) => p.tag).filter((t): t is string => !!t);
    return Array.from(new Set([...SEED_TAGS, ...used])).sort();
  }, [principals]);
  const governanceRuleSuggestions = useMemo(() => {
    const used = principals.flatMap((p) => p.governanceRules);
    return Array.from(new Set([...SEED_GOVERNANCE_RULES, ...used])).sort();
  }, [principals]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await adminApi.proxies.deleteProxy({ params: { did } });
      router.push("/admin/proxies");
    } catch {
      setError("Network error while deleting proxy");
    } finally {
      setDeleting(false);
    }
  };

  const toolbarActions: ToolbarAction[] = [];
  if (proxy) {
    toolbarActions.push(
      {
        kind: "tabs",
        id: "section",
        value: activeTab,
        onChange: (v) => setActiveTab(v as Tab),
        options: [
          { value: "overview", label: "Overview", icon: <LayoutDashboard size={15} /> },
          { value: "upstreams", label: "Upstreams", icon: <Server size={15} /> },
          { value: "rules", label: "Rules", icon: <ListFilter size={15} /> },
          { value: "principals", label: "Principals", icon: <Users size={15} /> },
          {
            value: "pending",
            label: "Pending",
            icon: <ClipboardCheck size={15} />,
            badge:
              proxy.pendingPrincipalsCount > 0 ? (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-warning-100 text-warning-700 border border-warning-300 leading-none">
                  {proxy.pendingPrincipalsCount}
                </span>
              ) : undefined,
          },
          { value: "logs", label: "Logs", icon: <ScrollText size={15} /> },
        ],
      },
      {
        kind: "badge",
        id: "status",
        label: proxy.online ? "Online" : "Offline",
        tone: proxy.online ? "success" : "neutral",
      },
      {
        kind: "button",
        id: "delete",
        label: "Delete",
        icon: deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />,
        onClick: () => setShowDeleteConfirm(true),
        disabled: deleting,
      }
    );
  }

  useBreadcrumbs(
    [{ label: "Proxies", href: "/admin/proxies" }, { label: proxy?.name ?? "Proxy" }],
    [proxy?.name]
  );
  useToolbar(
    {
      title: proxy?.name ?? "Proxy",
      description: proxy ? <span className="font-mono">{proxy.did}</span> : did,
      actions: toolbarActions,
    },
    [proxy, deleting, did, activeTab]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-foreground-500">Loading proxy details…</p>
      </div>
    );
  }

  if (error || !proxy) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="bg-danger-50 border border-danger-300 rounded-lg px-4 py-3 text-danger-600">
          {error ?? "Proxy not found"}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 w-full max-w-7xl mx-auto space-y-0">
      <ConfirmModal
        open={showDeleteConfirm}
        title="Delete proxy"
        message={`Are you sure you want to delete ${proxy.name}? This removes it and all of its upstreams, rules, and principals. This cannot be undone.`}
        confirmLabel="Delete proxy"
        variant="danger"
        loading={deleting}
        onConfirm={async () => {
          setShowDeleteConfirm(false);
          await handleDelete();
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <div className="border border-neutral-200 rounded-xl overflow-hidden bg-background-100">
        <div className="p-6">
          {activeTab === "overview" && <OverviewTab proxy={proxy} onChanged={fetchAll} />}
          {activeTab === "upstreams" && (
            <UpstreamsTab did={did} upstreams={upstreams} onChanged={fetchAll} />
          )}
          {activeTab === "rules" && <RulesTab did={did} rules={rules} onChanged={fetchAll} />}
          {activeTab === "principals" && (
            <PrincipalsTab
              did={did}
              principals={principals}
              tagSuggestions={tagSuggestions}
              governanceRuleSuggestions={governanceRuleSuggestions}
              onChanged={fetchAll}
            />
          )}
          {activeTab === "pending" && (
            <PendingPrincipalsTab
              did={did}
              principals={principals}
              tagSuggestions={tagSuggestions}
              governanceRuleSuggestions={governanceRuleSuggestions}
              onChanged={fetchAll}
            />
          )}
          {activeTab === "logs" && <LogsTab did={did} />}
        </div>
      </div>
    </div>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────

function OverviewTab({
  proxy,
  onChanged,
}: {
  proxy: ProxyInfo;
  onChanged: () => void;
}) {
  const [saving, setSaving] = useState(false);

  const setDefaultMode = async (defaultMode: "passthrough" | "deny") => {
    setSaving(true);
    try {
      await adminApi.proxies.updateProxy({ params: { did: proxy.did }, body: { defaultMode } });
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-2">Identity</h3>
        <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
          <dt className="text-foreground-500">DID</dt>
          <dd className="font-mono text-xs break-all">{proxy.did}</dd>
          <dt className="text-foreground-500">Registered</dt>
          <dd>{timeAgo(proxy.registeredAt)}</dd>
          <dt className="text-foreground-500">Last seen</dt>
          <dd>{timeAgo(proxy.lastSeen)}</dd>
        </dl>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-2">
          Default mode
          <span className="ml-2 font-normal text-foreground-400 text-xs">
            applied when no rule matches a request
          </span>
        </h3>
        <div className="flex gap-2">
          {(["deny", "passthrough"] as const).map((mode) => (
            <button
              key={mode}
              disabled={saving}
              onClick={() => setDefaultMode(mode)}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                proxy.defaultMode === mode
                  ? "bg-primary-500 text-white border-primary-500"
                  : "bg-background-100 border-neutral-300 text-foreground-600 hover:bg-background-200"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Upstreams ────────────────────────────────────────────────────────────────

function UpstreamsTab({
  did,
  upstreams,
  onChanged,
}: {
  did: string;
  upstreams: ProxyUpstream[];
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!name || !baseUrl) return;
    setSaving(true);
    try {
      await adminApi.proxies.createUpstream({ params: { did }, body: { name, baseUrl } });
      setName("");
      setBaseUrl("");
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    await adminApi.proxies.deleteUpstream({ params: { did, id } });
    onChanged();
  };

  return (
    <div className="space-y-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-xs font-medium text-foreground-400 uppercase tracking-wider">
            <th className="py-2">Name</th>
            <th className="py-2">Base URL</th>
            <th className="py-2 w-10" />
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200">
          {upstreams.map((u) => (
            <tr key={u.id}>
              <td className="py-2.5 font-medium">{u.name}</td>
              <td className="py-2.5 font-mono text-xs text-foreground-500">{u.baseUrl}</td>
              <td className="py-2.5">
                <button
                  onClick={() => remove(u.id)}
                  className="text-foreground-400 hover:text-danger-500"
                >
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
          {upstreams.length === 0 && (
            <tr>
              <td colSpan={3} className="py-6 text-center text-foreground-400">
                No upstreams configured yet
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="flex gap-2 pt-2 border-t border-neutral-200">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="flex-1 px-3 py-1.5 rounded-lg border border-neutral-300 bg-background-100 text-sm"
        />
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://mytoolendpoint.com"
          className="flex-[2] px-3 py-1.5 rounded-lg border border-neutral-300 bg-background-100 text-sm font-mono"
        />
        <button
          onClick={create}
          disabled={saving || !name || !baseUrl}
          className="px-3 py-1.5 rounded-lg bg-primary-500 text-white text-sm flex items-center gap-1.5 disabled:opacity-50"
        >
          <Plus size={14} /> Add
        </button>
      </div>
    </div>
  );
}

// ── Rules ────────────────────────────────────────────────────────────────────

function RulesTab({
  did,
  rules,
  onChanged,
}: {
  did: string;
  rules: ProxyRule[];
  onChanged: () => void;
}) {
  const [method, setMethod] = useState("GET");
  const [urlPattern, setUrlPattern] = useState("");
  const [mode, setMode] = useState<"no_check" | "governed">("governed");
  const [governanceRule, setGovernanceRule] = useState("");
  const [sourceFrom, setSourceFrom] = useState<"header" | "url" | "body">("header");
  const [sourceKey, setSourceKey] = useState("");
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!urlPattern) return;
    setSaving(true);
    try {
      await adminApi.proxies.createRule({
        params: { did },
        body: {
          method,
          urlPattern,
          mode,
          governanceRule: mode === "governed" ? governanceRule || undefined : undefined,
          principalIdSource:
            mode === "governed" && sourceKey ? { from: sourceFrom, key: sourceKey } : undefined,
        },
      });
      setUrlPattern("");
      setGovernanceRule("");
      setSourceKey("");
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    await adminApi.proxies.deleteRule({ params: { did, id } });
    onChanged();
  };

  return (
    <div className="space-y-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-xs font-medium text-foreground-400 uppercase tracking-wider">
            <th className="py-2">Method</th>
            <th className="py-2">URL pattern</th>
            <th className="py-2">Mode</th>
            <th className="py-2">Governance rule</th>
            <th className="py-2 w-10" />
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200">
          {rules.map((r) => (
            <tr key={r.id}>
              <td className="py-2.5 font-mono text-xs">{r.method}</td>
              <td className="py-2.5 font-mono text-xs text-foreground-500">{r.urlPattern}</td>
              <td className="py-2.5">
                <span
                  className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded font-medium border ${
                    r.mode === "no_check"
                      ? "bg-background-200 text-foreground-600 border-neutral-300"
                      : "bg-primary-100 text-primary-700 border-primary-300"
                  }`}
                >
                  {r.mode}
                </span>
              </td>
              <td className="py-2.5 text-foreground-500">{r.governanceRule ?? "—"}</td>
              <td className="py-2.5">
                <button
                  onClick={() => remove(r.id)}
                  className="text-foreground-400 hover:text-danger-500"
                >
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
          {rules.length === 0 && (
            <tr>
              <td colSpan={5} className="py-6 text-center text-foreground-400">
                No rules configured yet — every request will be denied by default
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="space-y-2 pt-2 border-t border-neutral-200">
        <div className="flex gap-2">
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="px-2 py-1.5 rounded-lg border border-neutral-300 bg-background-100 text-sm"
          >
            {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <input
            value={urlPattern}
            onChange={(e) => setUrlPattern(e.target.value)}
            placeholder="https://mytoolendpoint.com/api/*"
            className="flex-1 px-3 py-1.5 rounded-lg border border-neutral-300 bg-background-100 text-sm font-mono"
          />
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as "no_check" | "governed")}
            className="px-2 py-1.5 rounded-lg border border-neutral-300 bg-background-100 text-sm"
          >
            <option value="governed">governed</option>
            <option value="no_check">no_check</option>
          </select>
        </div>
        {mode === "governed" && (
          <div className="flex gap-2">
            <input
              value={governanceRule}
              onChange={(e) => setGovernanceRule(e.target.value)}
              placeholder="Governance rule (e.g. internet_access)"
              className="flex-1 px-3 py-1.5 rounded-lg border border-neutral-300 bg-background-100 text-sm"
            />
            <select
              value={sourceFrom}
              onChange={(e) => setSourceFrom(e.target.value as "header" | "url" | "body")}
              className="px-2 py-1.5 rounded-lg border border-neutral-300 bg-background-100 text-sm"
            >
              <option value="header">header</option>
              <option value="url">url param</option>
              <option value="body">body key</option>
            </select>
            <input
              value={sourceKey}
              onChange={(e) => setSourceKey(e.target.value)}
              placeholder="Principal id key (e.g. X-Agent-Id)"
              className="flex-1 px-3 py-1.5 rounded-lg border border-neutral-300 bg-background-100 text-sm"
            />
          </div>
        )}
        <button
          onClick={create}
          disabled={saving || !urlPattern}
          className="px-3 py-1.5 rounded-lg bg-primary-500 text-white text-sm flex items-center gap-1.5 disabled:opacity-50"
        >
          <Plus size={14} /> Add rule
        </button>
      </div>
    </div>
  );
}

// ── Principals ───────────────────────────────────────────────────────────────

/** What each status actually means for enforcement — shown inline, not hidden behind a hover. */
const STATUS_HELP: Record<string, string> = {
  pending:
    "Newly discovered, not yet reviewed. Governed rules deny this principal until you set it to active.",
  active:
    "Reviewed and authorized. Governed rules are granted whenever their governance rule is in the list below.",
  revoked:
    "Reviewed and explicitly denied. Same effect as pending (governed rules still deny it) — revoked just records that this was a deliberate decision, not an oversight.",
};

interface PrincipalEdits {
  tag: string;
  governanceRules: string[];
  status: string;
}

function PrincipalCard({
  did,
  principal,
  tagSuggestions,
  governanceRuleSuggestions,
  onChanged,
}: {
  did: string;
  principal: ProxyPrincipal;
  tagSuggestions: string[];
  governanceRuleSuggestions: string[];
  onChanged: () => void;
}) {
  const [edit, setEdit] = useState<PrincipalEdits>({
    tag: principal.tag ?? "",
    governanceRules: principal.governanceRules,
    status: principal.status,
  });
  const [saving, setSaving] = useState(false);

  const patch = (p: Partial<PrincipalEdits>) => setEdit((prev) => ({ ...prev, ...p }));

  const save = async () => {
    setSaving(true);
    try {
      await adminApi.proxies.updatePrincipal({
        params: { did, id: principal.id },
        body: {
          tag: edit.tag || null,
          governanceRules: edit.governanceRules,
          status: edit.status as "pending" | "active" | "revoked",
        },
      });
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    await adminApi.proxies.deletePrincipal({ params: { did, id: principal.id } });
    onChanged();
  };

  const pending = principal.status === "pending";
  const tagListId = `tag-options-${principal.id}`;

  return (
    <div
      className={`rounded-lg p-3 space-y-2.5 border ${
        pending ? "border-warning-300 bg-warning-50/50" : "border-neutral-200"
      }`}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {pending && <AlertTriangle size={13} className="text-warning-600 shrink-0" />}
          <span className="font-mono text-xs text-foreground-500" title={principal.did}>
            {principal.did.slice(0, 24)}…
          </span>
          {principal.externalId && (
            <span className="text-xs text-foreground-400">({principal.externalId})</span>
          )}
          {principal.provisionedByProxy && (
            <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded font-medium border bg-secondary-100 text-secondary-700 border-secondary-300">
              proxy-provisioned
            </span>
          )}
        </div>
        <button onClick={remove} className="text-foreground-400 hover:text-danger-500">
          <Trash2 size={14} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-2.5 items-start">
        <div>
          <label className="text-[10px] font-medium text-foreground-400 uppercase tracking-wide block mb-1">
            Tag
          </label>
          <input
            list={tagListId}
            value={edit.tag}
            onChange={(e) => patch({ tag: e.target.value })}
            placeholder="ai_agent, service…"
            className="w-full px-2 py-1.5 rounded-lg border border-neutral-300 bg-background-100 text-xs"
          />
          <datalist id={tagListId}>
            {tagSuggestions.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <p className="text-[10px] text-foreground-400 mt-1">
            Just a label to organize/filter — pick an existing one or type a new one.
          </p>
        </div>

        <div>
          <label className="text-[10px] font-medium text-foreground-400 uppercase tracking-wide block mb-1">
            Governance rules
          </label>
          <ChipMultiSelect
            values={edit.governanceRules}
            suggestions={governanceRuleSuggestions}
            placeholder="Add a governance rule…"
            onChange={(governanceRules) => patch({ governanceRules })}
          />
        </div>
      </div>

      <div className="flex items-end gap-2.5 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <label className="text-[10px] font-medium text-foreground-400 uppercase tracking-wide block mb-1">
            Status
          </label>
          <select
            value={edit.status}
            onChange={(e) => patch({ status: e.target.value })}
            className="w-full px-2 py-1.5 rounded-lg border border-neutral-300 bg-background-100 text-xs"
          >
            <option value="pending">pending</option>
            <option value="active">active</option>
            <option value="revoked">revoked</option>
          </select>
          <p className="text-[10px] text-foreground-400 mt-1">{STATUS_HELP[edit.status]}</p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="px-3 py-1.5 rounded-lg bg-primary-500 text-white text-xs disabled:opacity-50 shrink-0"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function PrincipalsTab({
  did,
  principals,
  tagSuggestions,
  governanceRuleSuggestions,
  onChanged,
}: {
  did: string;
  principals: ProxyPrincipal[];
  tagSuggestions: string[];
  governanceRuleSuggestions: string[];
  onChanged: () => void;
}) {
  if (principals.length === 0) {
    return (
      <p className="text-foreground-400 text-sm py-6 text-center">
        No principals seen yet — they appear here automatically the first time this proxy
        sees a caller or agent identity.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {principals.map((p) => (
        <PrincipalCard
          key={p.id}
          did={did}
          principal={p}
          tagSuggestions={tagSuggestions}
          governanceRuleSuggestions={governanceRuleSuggestions}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
}

// ── Pending principals (dedicated review queue) ───────────────────────────────

function PendingPrincipalsTab({
  did,
  principals,
  tagSuggestions,
  governanceRuleSuggestions,
  onChanged,
}: {
  did: string;
  principals: ProxyPrincipal[];
  tagSuggestions: string[];
  governanceRuleSuggestions: string[];
  onChanged: () => void;
}) {
  const pending = principals.filter((p) => p.status === "pending");

  if (pending.length === 0) {
    return (
      <p className="text-foreground-400 text-sm py-6 text-center">
        Nothing awaiting review — every known principal has been reviewed.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 bg-warning-50 border border-warning-300 rounded-lg px-3 py-2 text-xs text-warning-700">
        <AlertTriangle size={13} className="shrink-0" />
        {pending.length} principal{pending.length !== 1 ? "s" : ""} awaiting review — grant
        governance rules and set status to active to authorize them.
      </div>
      {pending.map((p) => (
        <PrincipalCard
          key={p.id}
          did={did}
          principal={p}
          tagSuggestions={tagSuggestions}
          governanceRuleSuggestions={governanceRuleSuggestions}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
}

// ── Logs ─────────────────────────────────────────────────────────────────────

function LogsTab({ did }: { did: string }) {
  const [entries, setEntries] = useState<ProxyActivityLog[]>([]);
  const [total, setTotal] = useState(0);
  const [verdict, setVerdict] = useState<"" | "allow" | "deny">("");
  const [offset, setOffset] = useState(0);
  const limit = 25;

  useEffect(() => {
    (async () => {
      const data = unwrap(
        await adminApi.proxies.listLogs({
          params: { did },
          query: { verdict: verdict || undefined, limit, offset },
        })
      );
      setEntries(data.entries);
      setTotal(data.total);
    })();
  }, [did, verdict, offset]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(["", "allow", "deny"] as const).map((v) => (
          <button
            key={v || "all"}
            onClick={() => {
              setVerdict(v);
              setOffset(0);
            }}
            className={`px-2.5 py-1 rounded-lg text-xs border ${
              verdict === v
                ? "bg-primary-500 text-white border-primary-500"
                : "bg-background-100 border-neutral-300 text-foreground-600"
            }`}
          >
            {v || "all"}
          </button>
        ))}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-xs font-medium text-foreground-400 uppercase tracking-wider">
            <th className="py-2">Time</th>
            <th className="py-2">Method</th>
            <th className="py-2">URL</th>
            <th className="py-2">Verdict</th>
            <th className="py-2">Principal</th>
            <th className="py-2">Reason</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200">
          {entries.map((e) => (
            <tr key={e.id}>
              <td className="py-2 text-xs text-foreground-500 whitespace-nowrap">
                {timeAgo(e.timestamp)}
              </td>
              <td className="py-2 font-mono text-xs">{e.method}</td>
              <td className="py-2 font-mono text-xs text-foreground-500 max-w-xs truncate">
                {e.url}
              </td>
              <td className="py-2">
                <span
                  className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded font-medium border ${
                    e.verdict === "allow"
                      ? "bg-success-100 text-success-700 border-success-300"
                      : "bg-danger-100 text-danger-700 border-danger-300"
                  }`}
                >
                  {e.verdict}
                </span>
              </td>
              <td className="py-2 font-mono text-xs text-foreground-500">
                {e.principalDid ? `${e.principalDid.slice(0, 20)}…` : "—"}
              </td>
              <td className="py-2 text-xs text-foreground-500">{e.reason ?? "—"}</td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr>
              <td colSpan={6} className="py-6 text-center text-foreground-400">
                No activity logged yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="flex items-center justify-between text-xs text-foreground-500">
        <span>{total} total</span>
        <div className="flex gap-2">
          <button
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
            className="px-2 py-1 rounded border border-neutral-300 disabled:opacity-40"
          >
            Prev
          </button>
          <button
            disabled={offset + limit >= total}
            onClick={() => setOffset(offset + limit)}
            className="px-2 py-1 rounded border border-neutral-300 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
