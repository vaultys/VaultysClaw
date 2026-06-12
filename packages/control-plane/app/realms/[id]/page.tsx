"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Globe2,
  ArrowLeft,
  Bot,
  Users,
  Trash2,
  ChevronRight,
  Star,
  Plus,
  X,
  Pencil,
  Check,
  Network,
  GitFork,
  LayoutTemplate,
  Puzzle,
  Lock,
  AlertCircle,
  Cpu,
  ExternalLink,
  MessageSquare,
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useWorkflowStore } from "@/components/workflow/store";
import { TemplateSelectionModal } from "@/components/workflow/TemplateSelectionModal";
import EmbeddedOrgChart from "@/components/graph/EmbeddedOrgChart";
import ChannelList from "@/components/channels/ChannelList";
import ChannelView from "@/components/channels/ChannelView";
import CreateChannelModal from "@/components/channels/CreateChannelModal";
import type { MapMarker } from "@/components/map/WorldMap";
import { useRole } from "@/hooks/useRole";
import {
  RealmLiteLLMKeyCard,
  type RealmRouterKeyData,
} from "@/components/realms/RealmLiteLLMKeyCard";
import { agentsClient, unwrap } from "@/lib/api/ts-rest/client";
import { AgentInfo } from "@/lib/contracts";

const WorldMap = dynamic(
  () => import("@/components/map/WorldMap").then((m) => m.WorldMap),
  { ssr: false }
);

interface Realm {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  isDefault: number;
  llmConfig: string | null;
  defaultCapabilities: string;
  createdAt: string;
  tokenUsage?: { promptTokens: number; completionTokens: number } | null;
}

interface RealmAgent {
  agentDid: string;
  agentName: string;
  capabilities: string;
  isPrimary: number;
  joinedAt: string;
}

interface RealmUser {
  userDid: string;
  name: string | null;
  email: string | null;
  isPrimary: number;
  joinedAt: string;
}

interface RealmWorkflow {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RealmSkill {
  id: string;
  realmId: string;
  name: string;
  description: string | null;
  version: string | null;
  isRequired: boolean;
  config: Record<string, unknown>;
  createdAt: string;
}

interface FullAgent {
  id: string;
  name: string;
  realms: { id: string }[];
}
interface FullUser {
  did: string;
  name: string | null;
  email: string | null;
}

interface Channel {
  id: string;
  realmId: string | null;
  name: string;
  slug: string;
  description: string | null;
  isPublic: boolean;
  isArchived: boolean;
  topic: string | null;
  creatorDid: string;
  createdAt: string;
  updatedAt: string;
}

const PRESET_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#06b6d4",
];

function shortDid(did: string | null | undefined) {
  if (!did) return "—";
  return did.length > 24 ? `${did.slice(0, 12)}…${did.slice(-6)}` : did;
}

function initials(name: string | null, fallback: string) {
  if (name)
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  return fallback.slice(-2).toUpperCase();
}

// ---- Add member modal ----
function AddMemberModal({
  realm,
  type,
  onClose,
  onAdded,
}: {
  realm: Realm;
  type: "agent" | "user";
  onClose: () => void;
  onAdded: () => void;
}) {
  const [items, setItems] = useState<FullUser[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (type === "agent") {
      agentsClient
        .search()
        .then((r) => unwrap(r))
        .then((d) => setAgents(d.items));
    } else {
      fetch("/api/users")
        .then((r) => r.json())
        .then((d) => setItems(d.users ?? []));
    }
  }, [type]);

  // Filter out already-members (agents already have realm array)
  const available =
    type === "agent"
      ? agents.filter(
          (a) => !a.agentRealms?.some((r) => r.realmId === realm.id)
        )
      : (items as FullUser[]);

  async function handleAdd() {
    if (!selected) return;
    setSaving(true);
    setError("");
    const url = `/api/realms/${realm.id}/${type === "agent" ? "agents" : "users"}`;
    const body =
      type === "agent"
        ? { agentDid: selected, isPrimary }
        : { userDid: selected, isPrimary };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "Failed");
      setSaving(false);
      return;
    }
    onAdded();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-background-100 border border-neutral-200 rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-base font-semibold text-foreground mb-4">
          Add {type === "agent" ? "Agent" : "User"}
        </h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-foreground-500 mb-1">
              Select {type}
            </label>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full bg-background border border-neutral-200 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">— choose —</option>
              {available.map((item) => {
                const id =
                  type === "agent"
                    ? (item as AgentInfo).did
                    : (item as FullUser).did;
                const label =
                  type === "agent"
                    ? (item as AgentInfo).name
                    : ((item as FullUser).name ??
                      shortDid((item as FullUser).did));
                return (
                  <option key={id} value={id}>
                    {label}
                  </option>
                );
              })}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              className="accent-primary-600"
            />
            Set as primary realm for this {type}
          </label>
          {error && (
            <p className="text-danger-600 dark:text-danger-400 text-sm">
              {error}
            </p>
          )}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2 rounded-xl border border-neutral-200 text-foreground-500 text-sm hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!selected || saving}
              className="flex-1 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {saving ? "Adding…" : "Add"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Main page ----
export default function RealmDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { isGlobalAdmin } = useRole();

  const [realm, setRealm] = useState<Realm | null>(null);
  const [agents, setAgents] = useState<RealmAgent[]>([]);
  const [users, setUsers] = useState<RealmUser[]>([]);
  const [workflows, setWorkflows] = useState<RealmWorkflow[]>([]);
  const [tokenUsage, setTokenUsage] = useState<{
    promptTokens: number;
    completionTokens: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<
    | "agents"
    | "users"
    | "workflows"
    | "config"
    | "org-chart"
    | "skills"
    | "models"
    | "channels"
    | "map"
  >("agents");
  const [mapMarkers, setMapMarkers] = useState<MapMarker[]>([]);
  const [mapLoading, setMapLoading] = useState(false);

  const refreshMapMarkers = useCallback(() => {
    setMapLoading(true);
    fetch(`/api/map?realm=${id}`)
      .then((r) => (r.ok ? r.json() : { markers: [] }))
      .then((d: { markers?: MapMarker[] }) => setMapMarkers(d.markers ?? []))
      .catch(() => {})
      .finally(() => setMapLoading(false));
  }, [id]);

  const saveRealmMarkerLocation = useCallback(
    async (
      marker: MapMarker,
      loc: { lat: number; lon: number; label: string } | null
    ) => {
      const body =
        loc === null
          ? { lat: null }
          : { lat: loc.lat, lon: loc.lon, label: loc.label };
      let endpoint = "";
      if (marker.type === "agent")
        endpoint = `/api/agents/${encodeURIComponent(marker.id)}/location`;
      else if (marker.type === "user")
        endpoint = `/api/users/${encodeURIComponent(marker.id)}/location`;
      if (!endpoint) return;
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(d?.error ?? "Failed to update location");
      }
      refreshMapMarkers();
    },
    [refreshMapMarkers]
  );
  const [realmModels, setRealmModels] = useState<
    {
      id: string;
      name: string;
      provider: string;
      modelId: string;
      litellmModelName: string | null;
      status: string;
    }[]
  >([]);
  const [routerKey, setRouterKey] = useState<RealmRouterKeyData | null>(null);
  const [litellmConfigured, setLitellmConfigured] = useState(false);
  const [skills, setSkills] = useState<RealmSkill[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
    null
  );
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const selectedChannel =
    channels.find((ch) => ch.id === selectedChannelId) ?? null;
  const [addModal, setAddModal] = useState<"agent" | "user" | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const setWorkflowStore = useWorkflowStore((s) => s.setWorkflow);
  const clearWorkflowStore = useWorkflowStore((s) => s.clearWorkflow);

  // Inline edit
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editColor, setEditColor] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [realmRes, skillsRes, modelsRes, channelsRes] = await Promise.all([
      fetch(`/api/realms/${id}`),
      fetch(`/api/realms/${id}/skills`),
      fetch(`/api/realms/${id}/models`),
      fetch(`/api/channels?realm=${id}`),
    ]);
    if (realmRes.status === 404) {
      router.replace("/realms");
      return;
    }
    const data = (await realmRes.json()) as {
      realm: Realm;
      agents: RealmAgent[];
      users: RealmUser[];
      workflows: RealmWorkflow[];
      tokenUsage?: { promptTokens: number; completionTokens: number } | null;
    };
    setRealm(data.realm);
    setAgents(data.agents);
    setUsers(data.users);
    setWorkflows(data.workflows ?? []);
    setTokenUsage(data.tokenUsage ?? null);
    if (skillsRes.ok) {
      const skillsData = (await skillsRes.json()) as { skills: RealmSkill[] };
      setSkills(skillsData.skills ?? []);
    }
    if (modelsRes.ok) {
      const modelsData = (await modelsRes.json()) as {
        models: typeof realmModels;
        routerKey: RealmRouterKeyData | null;
        litellmConfigured: boolean;
      };
      setRealmModels(modelsData.models ?? []);
      setRouterKey(modelsData.routerKey);
      setLitellmConfigured(modelsData.litellmConfigured ?? false);
    }
    if (channelsRes.ok) {
      const channelsData = (await channelsRes.json()) as {
        channels: Channel[];
      };
      setChannels(channelsData.channels ?? []);
    }
    setLoading(false);
  }, [id, router]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSelectTemplate(templateId: string) {
    try {
      const res = await fetch(`/api/workflows/templates/${templateId}`);
      if (!res.ok) throw new Error("Failed to load template");
      const data = (await res.json()) as {
        template: { definition: any; name: string };
      };
      clearWorkflowStore();
      setWorkflowStore("", data.template.name, "", data.template.definition);
      router.push(`/workflows/new/edit?fromTemplate=1&realm=${id}`);
    } catch (err) {
      console.error("Failed to load template:", err);
      alert("Failed to load template");
    }
  }

  function startEdit() {
    if (!realm) return;
    setEditName(realm.name);
    setEditDesc(realm.description ?? "");
    setEditColor(realm.color);
    setEditing(true);
  }

  async function saveEdit() {
    setSaving(true);
    await fetch(`/api/realms/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName,
        description: editDesc,
        color: editColor,
      }),
    });
    setSaving(false);
    setEditing(false);
    load();
  }

  async function handleRemoveAgent(did: string) {
    if (!confirm("Remove agent from this realm?")) return;
    await fetch(`/api/realms/${id}/agents`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentDid: did }),
    });
    load();
  }

  async function handleRemoveUser(did: string) {
    if (!confirm("Remove user from this realm?")) return;
    await fetch(`/api/realms/${id}/users`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userDid: did }),
    });
    load();
  }

  async function handleSetDefault() {
    await fetch(`/api/realms/${id}/default`, { method: "POST" });
    load();
  }

  async function handleDelete() {
    if (!confirm("Delete this realm? This cannot be undone.")) return;
    await fetch(`/api/realms/${id}`, { method: "DELETE" });
    router.push("/realms");
  }

  if (loading) {
    return (
      <div className="flex justify-center py-32">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!realm) return null;

  return (
    <div className="p-6 w-full max-w-7xl mx-auto space-y-5">
      {/* Back */}
      <Link
        href="/realms"
        className="inline-flex items-center gap-1.5 text-foreground-500 hover:text-foreground text-sm transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Realms
      </Link>

      {/* Header card */}
      <div className="bg-background-100 border border-neutral-200 rounded-2xl overflow-hidden">
        <div className="h-1.5" style={{ backgroundColor: realm.color }} />
        <div className="p-5 flex items-start gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
            style={{
              backgroundColor: realm.color + "22",
              border: `1px solid ${realm.color}44`,
            }}
          >
            <Globe2 className="w-6 h-6" style={{ color: realm.color }} />
          </div>
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="space-y-2">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="bg-background border border-neutral-200 rounded-lg px-3 py-1.5 text-sm text-foreground w-full max-w-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={2}
                  className="bg-background border border-neutral-200 rounded-lg px-3 py-1.5 text-sm text-foreground w-full focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                  placeholder="Description"
                />
                <div className="flex gap-1.5 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setEditColor(c)}
                      className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                      style={{
                        backgroundColor: c,
                        borderColor: editColor === c ? "white" : "transparent",
                        boxShadow: editColor === c ? `0 0 0 2px ${c}` : "none",
                      }}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={saveEdit}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 text-foreground-500 hover:text-foreground text-xs transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg font-semibold text-foreground">
                    {realm.name}
                  </h1>
                  {realm.isDefault === 1 && (
                    <span className="text-xs px-2 py-0.5 rounded-md bg-warning-50 dark:bg-warning-500/10 text-warning-700 dark:text-warning-400 font-medium">
                      default
                    </span>
                  )}
                  <code className="text-xs text-foreground-400 font-mono bg-background-200 px-1.5 py-0.5 rounded">
                    {realm.slug}
                  </code>
                </div>
                {realm.description && (
                  <p className="text-foreground-500 text-sm mt-1">
                    {realm.description}
                  </p>
                )}
                <p className="text-foreground-400 text-xs mt-1.5">
                  {agents.length} agent{agents.length !== 1 ? "s" : ""} ·{" "}
                  {users.length} user{users.length !== 1 ? "s" : ""} ·{" "}
                  {workflows.length} workflow{workflows.length !== 1 ? "s" : ""}
                  · Created {new Date(realm.createdAt).toLocaleDateString()}
                </p>
              </>
            )}
          </div>
          {!editing && (
            <div className="flex items-center gap-1 shrink-0">
              <Link
                href={`/realms/${id}/graph`}
                className="p-2 rounded-lg text-foreground-500 hover:text-primary-400 hover:bg-primary-400/10 transition-colors"
                title="View relationship graph"
              >
                <Network className="w-4 h-4" />
              </Link>
              <button
                onClick={startEdit}
                className="p-2 rounded-lg text-foreground-500 hover:text-foreground hover:bg-background-200 transition-colors"
                title="Edit realm"
              >
                <Pencil className="w-4 h-4" />
              </button>
              {realm.isDefault !== 1 && (
                <button
                  onClick={handleSetDefault}
                  className="p-2 rounded-lg text-foreground-500 hover:text-warning-400 hover:bg-warning-400/10 transition-colors"
                  title="Set as default realm"
                >
                  <Star className="w-4 h-4" />
                </button>
              )}
              {realm.isDefault !== 1 && (
                <button
                  onClick={handleDelete}
                  className="p-2 rounded-lg text-foreground-500 hover:text-danger-400 hover:bg-danger-400/10 transition-colors"
                  title="Delete realm"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Token metrics — always shown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-background-100 border border-neutral-200 rounded-2xl p-5">
          <p className="text-xs text-foreground-400 mb-2">Input Tokens</p>
          <p className="text-2xl font-bold text-primary-700 dark:text-primary-400">
            {(tokenUsage?.promptTokens ?? 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-background-100 border border-neutral-200 rounded-2xl p-5">
          <p className="text-xs text-foreground-400 mb-2">Output Tokens</p>
          <p className="text-2xl font-bold text-primary-700 dark:text-primary-400">
            {(tokenUsage?.completionTokens ?? 0).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-neutral-200">
        {(
          [
            "agents",
            "users",
            "workflows",
            "skills",
            "models",
            "channels",
            "org-chart",
            "map",
            "config",
          ] as const
        ).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              if (t === "map") {
                refreshMapMarkers();
              }
            }}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? "border-primary-500 text-primary-700 dark:text-primary-400"
                : "border-transparent text-foreground-500 hover:text-foreground"
            }`}
          >
            {t === "agents" && `Agents (${agents.length})`}
            {t === "users" && `Users (${users.length})`}
            {t === "workflows" && `Workflows (${workflows.length})`}
            {t === "skills" && `Skills (${skills.length})`}
            {t === "models" && `Models (${realmModels.length})`}
            {t === "channels" && `Channels (${channels.length})`}
            {t === "org-chart" && "Org Chart"}
            {t === "map" && "Map"}
            {t === "config" && "Config"}
          </button>
        ))}
      </div>

      {/* Agents tab */}
      {tab === "agents" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              onClick={() => setAddModal("agent")}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Agent
            </button>
          </div>
          {agents.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Bot className="w-8 h-8 text-neutral-300 mb-2" />
              <p className="text-foreground-500 text-sm">
                No agents in this realm.
              </p>
            </div>
          ) : (
            <div className="bg-background-100 border border-neutral-200 rounded-2xl overflow-hidden">
              {agents.map((a, i) => (
                <div
                  key={a.agentDid}
                  className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-neutral-200/50" : ""}`}
                >
                  <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-600/20 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-primary-700 dark:text-primary-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">
                        {a.agentName}
                      </span>
                      {a.isPrimary === 1 && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-warning-50 dark:bg-warning-500/10 text-warning-700 dark:text-warning-400">
                          primary
                        </span>
                      )}
                    </div>
                    <code className="text-xs text-foreground-400 font-mono">
                      {shortDid(a.agentDid)}
                    </code>
                  </div>
                  <Link
                    href={`/agents/${a.agentDid}`}
                    className="p-1.5 rounded-lg text-foreground-500 hover:text-primary-400 transition-colors"
                    title="View agent"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                  {realm.isDefault !== 1 && (
                    <button
                      onClick={() => handleRemoveAgent(a.agentDid)}
                      className="p-1.5 rounded-lg text-foreground-500 hover:text-danger-400 hover:bg-danger-400/10 transition-colors"
                      title="Remove from realm"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Users tab */}
      {tab === "users" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              onClick={() => setAddModal("user")}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> Add User
            </button>
          </div>
          {users.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Users className="w-8 h-8 text-neutral-300 mb-2" />
              <p className="text-foreground-500 text-sm">
                No users in this realm.
              </p>
            </div>
          ) : (
            <div className="bg-background-100 border border-neutral-200 rounded-2xl overflow-hidden">
              {users.map((u, i) => (
                <div
                  key={u.userDid}
                  className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-neutral-200/50" : ""}`}
                >
                  <div className="w-8 h-8 rounded-full bg-background-200 border border-neutral-200 flex items-center justify-center shrink-0 text-xs font-semibold text-foreground-500">
                    {initials(u.name, u.userDid)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">
                        {u.name ?? shortDid(u.userDid)}
                      </span>
                      {u.isPrimary === 1 && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-warning-50 dark:bg-warning-500/10 text-warning-700 dark:text-warning-400">
                          primary
                        </span>
                      )}
                    </div>
                    {u.email && (
                      <p className="text-xs text-foreground-400 truncate">
                        {u.email}
                      </p>
                    )}
                  </div>
                  {realm.isDefault !== 1 && (
                    <button
                      onClick={() => handleRemoveUser(u.userDid)}
                      className="p-1.5 rounded-lg text-foreground-500 hover:text-danger-400 hover:bg-danger-400/10 transition-colors"
                      title="Remove from realm"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Skills tab */}
      {tab === "skills" && (
        <RealmSkillsTab realmId={id} skills={skills} onChanged={load} />
      )}

      {/* Models tab */}
      {tab === "models" && (
        <div className="space-y-4">
          {/* LiteLLM Router Key — interactive card */}
          <RealmLiteLLMKeyCard
            realmId={id}
            routerKey={routerKey}
            litellmConfigured={litellmConfigured}
            modelCount={realmModels.length}
            onRefresh={load}
          />

          {/* Model access list */}
          {realmModels.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <Cpu className="w-8 h-8 text-neutral-300 mb-2" />
              <p className="text-foreground-500 text-sm">
                No models accessible to this realm.
              </p>
              <p className="text-foreground-400 text-xs mt-1 mb-3">
                Grant access from the Model Registry to route agents here.
              </p>
              <a
                href="/models"
                className="flex items-center gap-1.5 text-xs text-primary-700 dark:text-primary-400 hover:text-primary-300 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Go to Model Registry
              </a>
            </div>
          ) : (
            <div className="bg-background-100 border border-neutral-200 rounded-2xl overflow-hidden">
              {realmModels.map((m, i) => (
                <div
                  key={m.id}
                  className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-neutral-200/50" : ""}`}
                >
                  <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-600/20 flex items-center justify-center shrink-0">
                    <Cpu className="w-4 h-4 text-primary-700 dark:text-primary-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {m.name}
                      </span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-background-200 text-foreground-500 border border-neutral-200">
                        {m.provider}
                      </span>
                    </div>
                    <code className="text-xs text-foreground-400 font-mono truncate block">
                      {m.modelId}
                    </code>
                  </div>
                  <a
                    href={`/models/${m.id}`}
                    className="p-1.5 rounded-lg text-foreground-500 hover:text-foreground transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              ))}
            </div>
          )}

          {/* Coming soon: budget & rate limits */}
          <div className="relative">
            <div className="opacity-40 pointer-events-none select-none">
              <div className="bg-background-100 border border-neutral-200 rounded-2xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-foreground">
                  Budget &amp; Rate Limits
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ["Monthly spend cap", "$500 / month"],
                    ["RPM limit", "100 req/min"],
                    ["Alert at", "80% of budget"],
                  ].map(([label, val]) => (
                    <div key={label}>
                      <p className="text-xs text-foreground-500 mb-1">
                        {label}
                      </p>
                      <div className="h-8 bg-background border border-neutral-200 rounded-lg px-3 flex items-center text-sm text-foreground-500">
                        {val}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-foreground-400">
                  Enforced by LiteLLM virtual keys — requests rejected once the
                  cap is reached.
                </p>
              </div>
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 backdrop-blur-[2px] rounded-2xl">
              <Lock className="w-5 h-5 text-foreground-500" />
              <p className="text-sm font-semibold text-foreground">
                Budget &amp; Rate Limits
              </p>
              <p className="text-xs text-foreground-500 text-center max-w-xs">
                Per-realm spend caps and RPM limits — enforced automatically by
                LiteLLM virtual keys.
              </p>
              <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-warning-100 dark:bg-warning-900/40 text-warning-700 dark:text-warning-400 border border-warning-300 dark:border-warning-800 uppercase tracking-wide">
                Coming soon
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Config tab */}
      {tab === "config" && <RealmConfigTab realm={realm} onSaved={load} />}

      {/* Workflows tab */}
      {tab === "workflows" && (
        <div className="space-y-3">
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowTemplateModal(true)}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl bg-secondary-600 hover:bg-secondary-500 text-white font-medium transition-colors"
            >
              <LayoutTemplate className="w-4 h-4" /> From Template
            </button>
            <Link
              href={`/workflows/new/edit?realm=${id}`}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> New Workflow
            </Link>
          </div>
          {workflows.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <GitFork className="w-8 h-8 text-neutral-300 mb-2" />
              <p className="text-foreground-500 text-sm">
                No workflows in this realm.
              </p>
              <div className="flex gap-3 mt-3">
                <button
                  onClick={() => setShowTemplateModal(true)}
                  className="text-secondary-400 hover:text-secondary-300 text-sm underline"
                >
                  Start from template
                </button>
                <span className="text-foreground-400 text-sm">or</span>
                <Link
                  href={`/workflows/new/edit?realm=${id}`}
                  className="text-primary-700 dark:text-primary-400 hover:text-primary-300 text-sm underline"
                >
                  Create blank workflow
                </Link>
              </div>
            </div>
          ) : (
            <div className="bg-background-100 border border-neutral-200 rounded-2xl overflow-hidden">
              {workflows.map((wf, i) => (
                <div
                  key={wf.id}
                  className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-neutral-200/50" : ""}`}
                >
                  <div className="w-8 h-8 rounded-lg bg-secondary-600/20 flex items-center justify-center shrink-0">
                    <GitFork className="w-4 h-4 text-secondary-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-foreground truncate block">
                      {wf.name}
                    </span>
                    {wf.description && (
                      <p className="text-xs text-foreground-500 truncate">
                        {wf.description}
                      </p>
                    )}
                    <p className="text-xs text-foreground-400">
                      Updated {new Date(wf.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Link
                    href={`/workflows/${wf.id}`}
                    className="p-1.5 rounded-lg text-foreground-500 hover:text-primary-400 transition-colors"
                    title="Open workflow editor"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Channels tab */}
      {tab === "channels" && (
        <div className="flex h-[640px] border border-neutral-200 rounded-2xl overflow-hidden">
          {/* Sidebar: channel list */}
          <div className="w-60 border-r border-neutral-200 bg-background-100 flex flex-col shrink-0">
            <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">
                Channels
              </span>
              <button
                onClick={() => setShowCreateChannel(true)}
                className="p-1 rounded-lg hover:bg-background-200 transition text-foreground-500 hover:text-primary-400"
                title="New channel"
              >
                <Plus size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {channels.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-4 gap-2">
                  <MessageSquare className="w-6 h-6 text-neutral-300" />
                  <p className="text-xs text-foreground-500">
                    No channels yet.
                  </p>
                  <button
                    onClick={() => setShowCreateChannel(true)}
                    className="text-xs text-primary-700 dark:text-primary-400 hover:underline"
                  >
                    Create one
                  </button>
                </div>
              ) : (
                <ChannelList
                  channels={channels}
                  selectedChannelId={selectedChannelId}
                  onSelectChannel={setSelectedChannelId}
                />
              )}
            </div>
          </div>

          {/* Main: channel view or empty state */}
          <div className="flex-1 overflow-hidden">
            {selectedChannel ? (
              <ChannelView
                key={selectedChannel.id}
                channel={selectedChannel}
                realmId={id}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
                <MessageSquare className="w-10 h-10 text-neutral-300" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Select a channel
                  </p>
                  <p className="text-xs text-foreground-500 mt-1">
                    Choose a channel from the sidebar or create a new one.
                  </p>
                </div>
                <button
                  onClick={() => setShowCreateChannel(true)}
                  className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-medium transition-colors"
                >
                  <Plus className="w-4 h-4" /> New Channel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Map tab */}
      {tab === "map" && (
        <div className="space-y-3">
          <div className="bg-background-100 rounded-xl border border-neutral-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-200 flex items-center gap-2">
              <Globe2 className="w-4 h-4 text-primary-600" />
              <span className="text-sm font-semibold text-foreground">
                Realm Locations
              </span>
              <span className="text-xs text-foreground-500 bg-background-200 rounded-full px-2 py-0.5">
                {mapMarkers.length} located
              </span>
            </div>
            {mapLoading ? (
              <div className="flex justify-center py-16">
                <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : mapMarkers.length === 0 ? (
              <div className="px-5 py-16 text-center">
                <Globe2 className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
                <p className="text-foreground-500 text-sm">
                  No members of this realm have a location set.
                </p>
                <p className="text-foreground-400 text-xs mt-1">
                  Agents are auto-located on connect. Users can set their
                  location in their profile.
                </p>
              </div>
            ) : (
              <WorldMap
                markers={mapMarkers}
                height={480}
                onSaveLocation={saveRealmMarkerLocation}
                canEditLocation={isGlobalAdmin}
              />
            )}
          </div>
        </div>
      )}

      {/* Org Chart tab */}
      {tab === "org-chart" && (
        <div className="space-y-3">
          <EmbeddedOrgChart
            query={`?realm=${id}`}
            height={600}
            showFullscreenBtn={true}
          />
        </div>
      )}

      {/* Modals */}
      {addModal && (
        <AddMemberModal
          realm={realm}
          type={addModal}
          onClose={() => setAddModal(null)}
          onAdded={load}
        />
      )}
      {showTemplateModal && (
        <TemplateSelectionModal
          isOpen={showTemplateModal}
          onClose={() => setShowTemplateModal(false)}
          onSelectTemplate={handleSelectTemplate}
        />
      )}
      {showCreateChannel && (
        <CreateChannelModal
          preSelectedRealmId={id}
          onClose={() => setShowCreateChannel(false)}
          onChannelCreated={(channel) => {
            setShowCreateChannel(false);
            setChannels((prev) => [...prev, channel]);
            setSelectedChannelId(channel.id);
          }}
        />
      )}
    </div>
  );
}

// ---- Realm skills tab ----

function RealmSkillsTab({
  realmId,
  skills,
  onChanged,
}: {
  realmId: string;
  skills: RealmSkill[];
  onChanged: () => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addDesc, setAddDesc] = useState("");
  const [addVersion, setAddVersion] = useState("");
  const [addRequired, setAddRequired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleAdd() {
    if (!addName.trim()) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/realms/${realmId}/skills`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: addName.trim(),
        description: addDesc.trim() || undefined,
        version: addVersion.trim() || undefined,
        isRequired: addRequired,
      }),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "Failed to add skill");
      setSaving(false);
      return;
    }
    setAddName("");
    setAddDesc("");
    setAddVersion("");
    setAddRequired(false);
    setShowAdd(false);
    setSaving(false);
    onChanged();
  }

  async function handleToggleRequired(skill: RealmSkill) {
    await fetch(`/api/realms/${realmId}/skills/${skill.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isRequired: !skill.isRequired }),
    });
    onChanged();
  }

  async function handleDelete(skill: RealmSkill) {
    if (!confirm(`Remove skill "${skill.name}" from this realm?`)) return;
    await fetch(`/api/realms/${realmId}/skills/${skill.id}`, {
      method: "DELETE",
    });
    onChanged();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-foreground-500">
          Skills listed here are pushed to agents in this realm. Required skills
          cannot be disabled by agents.
        </p>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-medium transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" /> Add Skill
        </button>
      </div>

      {showAdd && (
        <div className="bg-background-100 border border-neutral-200 rounded-2xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Add Skill</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-foreground-500 mb-1">
                Skill name *
              </label>
              <input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="e.g. web-scraper"
                className="w-full bg-background border border-neutral-200 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs text-foreground-500 mb-1">
                Version
              </label>
              <input
                value={addVersion}
                onChange={(e) => setAddVersion(e.target.value)}
                placeholder="e.g. 1.0.0"
                className="w-full bg-background border border-neutral-200 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-foreground-500 mb-1">
              Description
            </label>
            <input
              value={addDesc}
              onChange={(e) => setAddDesc(e.target.value)}
              placeholder="What does this skill do?"
              className="w-full bg-background border border-neutral-200 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={addRequired}
              onChange={(e) => setAddRequired(e.target.checked)}
              className="accent-primary-600"
            />
            <Lock className="w-3.5 h-3.5 text-warning-700 dark:text-warning-400" />
            Required — agents cannot disable this skill
          </label>
          {error && (
            <p className="text-danger-600 dark:text-danger-400 text-sm flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={!addName.trim() || saving}
              className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {saving ? "Adding…" : "Add Skill"}
            </button>
            <button
              onClick={() => {
                setShowAdd(false);
                setError("");
              }}
              className="px-4 py-2 rounded-xl border border-neutral-200 text-foreground-500 hover:text-foreground text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {skills.length === 0 && !showAdd ? (
        <div className="flex flex-col items-center py-12 text-center">
          <Puzzle className="w-8 h-8 text-neutral-300 mb-2" />
          <p className="text-foreground-500 text-sm">
            No skills configured for this realm.
          </p>
          <p className="text-foreground-400 text-xs mt-1">
            Add skills to control which agent capabilities are available in this
            realm.
          </p>
        </div>
      ) : (
        skills.length > 0 && (
          <div className="bg-background-100 border border-neutral-200 rounded-2xl overflow-hidden">
            {skills.map((skill, i) => (
              <div
                key={skill.id}
                className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-neutral-200/50" : ""}`}
              >
                <div className="w-8 h-8 rounded-lg bg-secondary-600/20 flex items-center justify-center shrink-0">
                  <Puzzle className="w-4 h-4 text-secondary-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground font-mono">
                      {skill.name}
                    </span>
                    {skill.version && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-background-200 text-foreground-400 font-mono">
                        v{skill.version}
                      </span>
                    )}
                    {skill.isRequired ? (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-warning-50 dark:bg-warning-500/10 text-warning-700 dark:text-warning-400 flex items-center gap-1">
                        <Lock className="w-3 h-3" /> required
                      </span>
                    ) : (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-background-200 text-foreground-400">
                        optional
                      </span>
                    )}
                  </div>
                  {skill.description && (
                    <p className="text-xs text-foreground-500 truncate mt-0.5">
                      {skill.description}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleToggleRequired(skill)}
                  className={`p-1.5 rounded-lg transition-colors text-xs ${
                    skill.isRequired
                      ? "text-warning-400 hover:text-foreground-500 hover:bg-background-200"
                      : "text-foreground-500 hover:text-warning-400 hover:bg-warning-400/10"
                  }`}
                  title={skill.isRequired ? "Make optional" : "Make required"}
                >
                  <Lock className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(skill)}
                  className="p-1.5 rounded-lg text-foreground-500 hover:text-danger-400 hover:bg-danger-400/10 transition-colors"
                  title="Remove skill"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ---- Realm config tab (LLM override + default capabilities) ----

const ALL_CAPS = [
  "file_access",
  "internet_access",
  "browser_control",
  "api_call",
  "mail_send",
  "code_execution",
  "system_command",
  "llm_query",
];

function RealmConfigTab({
  realm,
  onSaved,
}: {
  realm: Realm;
  onSaved: () => void;
}) {
  const defaultCaps: string[] = JSON.parse(realm.defaultCapabilities || "[]");
  const [caps, setCaps] = useState<string[]>(defaultCaps);
  const [saving, setSaving] = useState(false);

  function toggle(cap: string) {
    setCaps((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]
    );
  }

  async function save() {
    setSaving(true);
    await fetch(`/api/realms/${realm.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultCapabilities: caps }),
    });
    setSaving(false);
    onSaved();
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div className="bg-background-100 border border-neutral-200 rounded-2xl p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-1">
            Default Capabilities
          </h3>
          <p className="text-xs text-foreground-500 mb-3">
            Capabilities suggested to admins when approving agents into this
            realm.
          </p>
          <div className="flex flex-wrap gap-2">
            {ALL_CAPS.map((cap) => (
              <button
                key={cap}
                onClick={() => toggle(cap)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors border ${
                  caps.includes(cap)
                    ? "bg-primary-50 dark:bg-primary-600/20 border-primary-300 dark:border-primary-500/50 text-primary-700 dark:text-primary-300"
                    : "bg-background-200 border-neutral-200 text-foreground-500 hover:text-foreground"
                }`}
              >
                {cap.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {saving ? "Saving…" : "Save Config"}
          </button>
        </div>
      </div>
    </div>
  );
}
