"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Users,
  Loader2,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  ChevronRight,
  ExternalLink,
  BookOpen,
  X,
} from "lucide-react";
import { Field, StatusBadge, IntegrationPanel, IntegrationHeader } from "./shared";
import { cn } from "@/lib/utils";
import { serverClient, unwrap } from "@/lib/api/ts-rest/client";

interface EntraGroup {
  id: string;
  displayName: string;
  description: string | null;
}

interface DiagnosticCheck {
  id: string;
  label: string;
  status: "ok" | "fail";
  detail: string | null;
  hint: string | null;
}

interface SyncResult {
  created: number;
  skipped: number;
  updated: number;
  errors: string[];
}

type WizardStep = "groups" | "workspace-map" | "confirm" | "syncing" | "done";

// ─── Setup guide ──────────────────────────────────────────────────────────────

const PILL = "font-mono text-xs bg-primary-100 border border-primary-300 text-primary-700 px-1.5 py-0.5 rounded";
const BOLD = "font-semibold text-foreground";
const LINK = "text-primary-600 hover:text-primary-500 inline-flex items-center gap-0.5 underline underline-offset-2";

const STEPS = [
  {
    number: "1",
    title: "Create an App Registration",
    body: (
      <>
        Open the{" "}
        <a href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noreferrer" className={LINK}>
          Microsoft Entra ID → App registrations <ExternalLink className="w-3 h-3" />
        </a>{" "}
        blade and click <strong className={BOLD}>New registration</strong>. Give it a name (e.g. <em>VaultysClaw Sync</em>), leave the redirect URI blank, and click <strong className={BOLD}>Register</strong>.
      </>
    ),
  },
  {
    number: "2",
    title: "Copy the Tenant ID and Client ID",
    body: (
      <>
        On the app&apos;s <strong className={BOLD}>Overview</strong> page copy the{" "}
        <span className={PILL}>Application (client) ID</span> and <span className={PILL}>Directory (tenant) ID</span>.
      </>
    ),
  },
  {
    number: "3",
    title: "Create a Client Secret",
    body: (
      <>
        Go to <strong className={BOLD}>Certificates &amp; secrets</strong> → <strong className={BOLD}>New client secret</strong>. Copy the <strong className={BOLD}>Value</strong> immediately — it is only shown once.
      </>
    ),
  },
  {
    number: "4",
    title: "Grant API permissions",
    body: (
      <>
        Add <strong className={BOLD}>Application permissions</strong> (not Delegated):{" "}
        <span className={PILL}>User.Read.All</span> and <span className={PILL}>Group.Read.All</span>.
        Then click <strong className={BOLD}>Grant admin consent</strong>.
      </>
    ),
  },
];

function SetupGuide() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-primary-200 bg-primary-50 overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-primary-100/70 transition"
      >
        <BookOpen className="w-4 h-4 text-primary-500 shrink-0" />
        <span className="text-sm font-medium text-primary-700 flex-1">
          How to get these credentials from the Azure portal
        </span>
        <ChevronRight className={cn("w-4 h-4 text-primary-500 transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <div className="px-4 pb-5 pt-2 space-y-4 border-t border-primary-200">
          {STEPS.map((step) => (
            <div key={step.number} className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary-200 border border-primary-400 text-primary-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                {step.number}
              </span>
              <div className="text-sm text-neutral-600 leading-relaxed">
                <span className="font-semibold text-neutral-800">{step.title} — </span>
                {step.body}
              </div>
            </div>
          ))}
          <a href="https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app" target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-500 transition"
          >
            <ExternalLink className="w-3 h-3" /> Full Microsoft documentation
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function EntraPanel() {
  const [tenantId, setTenantId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [checking, setChecking] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticCheck[] | null>(null);
  const [unclaimedCount, setUnclaimedCount] = useState(0);

  // Wizard
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>("groups");
  const [groups, setGroups] = useState<EntraGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [mapGroups, setMapGroups] = useState(false);
  const [workspaceMap, setWorkspaceMap] = useState<Record<string, string>>({});
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([]);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  useEffect(() => {
    serverClient
      .getEntra()
      .then((res) => {
        const d = unwrap(res) as {
          configured?: boolean;
          tenantId?: string;
          clientId?: string;
          clientSecret?: string;
        };
        if (d.configured) {
          setTenantId(d.tenantId ?? "");
          setClientId(d.clientId ?? "");
          setClientSecret(d.clientSecret ?? "");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    serverClient
      .entraUnclaimed()
      .then((res) => setUnclaimedCount(unwrap(res).users?.length ?? 0))
      .catch(() => {});
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      unwrap(
        await serverClient.saveEntra({
          body: { tenantId, clientId, clientSecret },
        })
      );
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } finally {
      setSaving(false);
    }
  };

  const checkConnection = async () => {
    setChecking(true);
    setDiagnostics(null);
    try {
      const d = unwrap(
        await serverClient.testEntra({
          body: { tenantId, clientId, clientSecret },
        })
      ) as { checks?: DiagnosticCheck[] };
      setDiagnostics(d.checks ?? []);
    } catch {
      setDiagnostics([{ id: "network", label: "Reach API endpoint", status: "fail", detail: "Network error", hint: "Could not reach the server." }]);
    } finally {
      setChecking(false);
    }
  };

  const openWizard = async () => {
    setWizardOpen(true);
    setWizardStep("groups");
    setSelectedGroups(new Set());
    setMapGroups(false);
    setWorkspaceMap({});
    setSyncResult(null);
    setGroupsError(null);
    setGroupsLoading(true);

    const [groupsRes, workspacesRes] = await Promise.allSettled([
      serverClient.testEntra({
        body: { tenantId, clientId, clientSecret },
      }),
      fetch("/api/workspaces").then((r) => r.json()),
    ]);

    if (groupsRes.status === "fulfilled" && groupsRes.value.status === 200) {
      const d = groupsRes.value.body as {
        ok?: boolean;
        checks?: DiagnosticCheck[];
        groups?: EntraGroup[];
        error?: string;
      };
      if (d.ok) {
        setGroups(d.groups ?? []);
        if (d.checks) setDiagnostics(d.checks);
      } else {
        if (d.checks) setDiagnostics(d.checks);
        const failedCheck = d.checks?.find((c) => c.status === "fail");
        setGroupsError(failedCheck?.hint ?? failedCheck?.detail ?? d.error ?? "Failed to connect to Entra");
      }
    } else {
      setGroupsError("Failed to connect to Entra");
    }

    if (workspacesRes.status === "fulfilled") {
      const d = workspacesRes.value as { workspaces?: { id: string; name: string }[] };
      setWorkspaces(d.workspaces ?? []);
    }

    setGroupsLoading(false);
  };

  const doSync = async () => {
    setWizardStep("syncing");
    const groupNames: Record<string, string> = {};
    for (const g of groups) groupNames[g.id] = g.displayName;
    try {
      const result = unwrap(
        await serverClient.entraSync({
          body: {
            groupIds: Array.from(selectedGroups),
            groupWorkspaceMap: mapGroups ? workspaceMap : {},
            groupNames,
          },
        })
      );
      setSyncResult(result as unknown as SyncResult);
      setWizardStep("done");
      serverClient
        .entraUnclaimed()
        .then((res) => setUnclaimedCount(unwrap(res).users?.length ?? 0))
        .catch(() => {});
    } catch {
      setSyncResult({ created: 0, skipped: 0, updated: 0, errors: ["Sync request failed"] });
      setWizardStep("done");
    }
  };

  const configured = !!(tenantId && clientId && clientSecret);
  const allChecksOk = diagnostics?.every((c) => c.status === "ok");

  return (
    <>
      <IntegrationPanel>
        <IntegrationHeader icon={Users} title="Microsoft Entra ID" description="Azure AD user sync" />
        <form onSubmit={save} className="p-5 space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-foreground-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              <SetupGuide />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Tenant ID" id="entra-tenant" value={tenantId} onChange={setTenantId} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
                <Field label="Client ID" id="entra-client" value={clientId} onChange={setClientId} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
              </div>
              <Field label="Client Secret" id="entra-secret" value={clientSecret} onChange={setClientSecret} showToggle placeholder="Your app secret value" />

              <div className="flex items-center gap-3 flex-wrap pt-1">
                <button type="submit" disabled={saving}
                  className="px-4 py-1.5 text-xs font-medium rounded-lg bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-40 transition flex items-center gap-1.5"
                >
                  {saving && <Loader2 className="w-3 h-3 animate-spin" />} Save
                </button>
                {configured && (
                  <button type="button" onClick={checkConnection} disabled={checking}
                    className="px-4 py-1.5 text-xs font-medium rounded-lg bg-background-200 border border-neutral-300 hover:border-foreground-500 text-foreground disabled:opacity-40 transition flex items-center gap-1.5"
                  >
                    {checking ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                    Check connection
                  </button>
                )}
                {configured && allChecksOk && (
                  <button type="button" onClick={openWizard}
                    className="px-4 py-1.5 text-xs font-medium rounded-lg bg-background-200 border border-neutral-300 hover:border-primary-500 text-foreground transition flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3 h-3" /> Sync users…
                  </button>
                )}
                {saveStatus === "saved" && <StatusBadge status="success" message="Saved" />}
                {saveStatus === "error" && <StatusBadge status="error" message="Save failed" />}
              </div>

              {/* Unclaimed users */}
              <div className="rounded-lg border border-neutral-200 bg-background-200 px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Pending claims</p>
                  <p className="text-xs text-foreground-500">
                    {unclaimedCount} user{unclaimedCount === 1 ? "" : "s"} waiting to claim an account
                  </p>
                </div>
                <Link href="/admin/users" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-background-100 border border-neutral-300 hover:border-primary-500 text-foreground transition">
                  <Users className="w-3 h-3" /> View users
                </Link>
              </div>

              {/* Diagnostics */}
              {diagnostics && (
                <div className="rounded-lg border border-neutral-200 overflow-hidden">
                  {diagnostics.map((check, i) => (
                    <div key={check.id} className={cn("px-4 py-3 space-y-1", i < diagnostics.length - 1 && "border-b border-neutral-200")}>
                      <div className="flex items-center gap-2">
                        {check.status === "ok"
                          ? <CheckCircle className="w-4 h-4 text-success-500 shrink-0" />
                          : <AlertCircle className="w-4 h-4 text-danger-500 shrink-0" />}
                        <span className={cn("text-sm font-medium", check.status === "ok" ? "text-success-700" : "text-danger-700")}>
                          {check.label}
                        </span>
                      </div>
                      {check.status === "fail" && check.hint && (
                        <p className="text-xs text-neutral-600 pl-6 leading-relaxed">{check.hint}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </form>
      </IntegrationPanel>

      {/* Sync Wizard */}
      {wizardOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-background-100 border border-neutral-300 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 shrink-0">
              <h2 className="text-foreground font-semibold">Sync Entra Users</h2>
              {wizardStep !== "syncing" && (
                <button onClick={() => setWizardOpen(false)} className="text-foreground-500 hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5">
              {wizardStep === "groups" && (
                <div className="space-y-4">
                  <p className="text-sm text-foreground-500">Select which Entra groups to import. Leave all unselected to import all users.</p>
                  {groupsLoading && <div className="flex items-center gap-2 text-foreground-500 text-sm py-4"><Loader2 className="w-4 h-4 animate-spin" /> Fetching groups…</div>}
                  {groupsError && (
                    <div className="bg-danger-50 border border-danger-300 rounded-lg px-4 py-3 text-sm text-danger-600 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {groupsError}
                    </div>
                  )}
                  {!groupsLoading && !groupsError && (
                    <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                      {groups.map((g) => (
                        <label key={g.id} className={cn("flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition",
                          selectedGroups.has(g.id) ? "bg-primary-100 border-primary-300" : "bg-background-200 border-neutral-300 hover:border-foreground-500"
                        )}>
                          <input type="checkbox" checked={selectedGroups.has(g.id)} onChange={() => setSelectedGroups((prev) => { const next = new Set(prev); next.has(g.id) ? next.delete(g.id) : next.add(g.id); return next; })} className="accent-primary-500" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">{g.displayName}</p>
                            {g.description && <p className="text-xs text-foreground-400 truncate">{g.description}</p>}
                          </div>
                        </label>
                      ))}
                      {groups.length === 0 && <p className="text-sm text-foreground-400 text-center py-6">No groups found in this tenant.</p>}
                    </div>
                  )}
                </div>
              )}

              {wizardStep === "workspace-map" && (
                <div className="space-y-4">
                  <p className="text-sm text-foreground-500">Map Entra groups to VaultysClaw workspaces? Synced users will be added to the corresponding workspace.</p>
                  <div className="flex gap-3">
                    {[{ v: false, label: "No, skip" }, { v: true, label: "Yes, map groups" }].map(({ v, label }) => (
                      <button key={String(v)} type="button" onClick={() => setMapGroups(v)}
                        className={cn("flex-1 py-2.5 rounded-xl border text-sm font-medium transition",
                          mapGroups === v ? "bg-primary-50 border-primary-300 text-primary-700" : "bg-background-200 border-neutral-300 text-foreground-500 hover:border-foreground-500"
                        )}
                      >{label}</button>
                    ))}
                  </div>
                  {mapGroups && selectedGroups.size > 0 && (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {Array.from(selectedGroups).map((gid) => {
                        const g = groups.find((x) => x.id === gid);
                        return (
                          <div key={gid} className="flex items-center gap-2">
                            <span className="text-xs text-foreground-700 shrink-0 w-36 truncate" title={g?.displayName ?? gid}>{g?.displayName ?? gid}</span>
                            <ChevronRight className="w-3 h-3 text-foreground-400 shrink-0" />
                            <select value={workspaceMap[gid] ?? ""} onChange={(e) => setWorkspaceMap((m) => ({ ...m, [gid]: e.target.value }))}
                              className="flex-1 bg-background-200 border border-neutral-300 rounded-lg px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary-500"
                            >
                              <option value="">— no workspace —</option>
                              <option value="__create__">✦ Create workspace from group name</option>
                              {workspaces.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {wizardStep === "confirm" && (
                <div className="space-y-4">
                  <p className="text-sm text-foreground-500">Ready to sync. Review your selection:</p>
                  <div className="bg-background-200 border border-neutral-300 rounded-lg p-4 space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-foreground-400">Groups</span><span className="text-foreground-700">{selectedGroups.size === 0 ? "All tenant users" : `${selectedGroups.size} group(s)`}</span></div>
                    <div className="flex justify-between"><span className="text-foreground-400">Workspace mapping</span><span className="text-foreground-700">{mapGroups ? "Enabled" : "Disabled"}</span></div>
                    <div className="flex justify-between pt-1 border-t border-neutral-200"><span className="text-foreground-400">Deduplication</span><span className="text-foreground-700">By email address</span></div>
                  </div>
                  <p className="text-xs text-foreground-400">New users will be created as unclaimed accounts. They must scan a QR code with their Vaultys wallet to activate.</p>
                </div>
              )}

              {wizardStep === "syncing" && (
                <div className="flex flex-col items-center gap-4 py-8">
                  <Loader2 className="w-8 h-8 text-primary-700 animate-spin" />
                  <p className="text-sm text-foreground-500">Syncing users from Entra…</p>
                </div>
              )}

              {wizardStep === "done" && syncResult && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-6 h-6 text-success-700 shrink-0" />
                    <p className="text-sm font-medium text-foreground">Sync complete</p>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[{ label: "Created", value: syncResult.created, color: "text-success-700" }, { label: "Updated", value: syncResult.updated, color: "text-primary-700" }, { label: "Skipped", value: syncResult.skipped, color: "text-foreground-500" }].map(({ label, value, color }) => (
                      <div key={label} className="bg-background-200 border border-neutral-300 rounded-lg p-3 text-center">
                        <p className={cn("text-2xl font-bold", color)}>{value}</p>
                        <p className="text-xs text-foreground-400 mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>
                  {syncResult.errors.length > 0 && (
                    <div className="bg-danger-50 border border-danger-300 rounded-lg p-3 space-y-1 max-h-36 overflow-y-auto">
                      {syncResult.errors.map((e, i) => <p key={i} className="text-xs text-danger-600">{e}</p>)}
                    </div>
                  )}
                </div>
              )}
            </div>

            {wizardStep !== "syncing" && (
              <div className="flex justify-between gap-3 px-6 py-4 border-t border-neutral-200 shrink-0">
                <button onClick={() => { if (wizardStep === "done" || wizardStep === "groups") { setWizardOpen(false); return; } if (wizardStep === "workspace-map") setWizardStep("groups"); if (wizardStep === "confirm") setWizardStep("workspace-map"); }}
                  className="px-4 py-2 text-sm rounded-lg bg-background-200 border border-neutral-300 hover:border-foreground-500 text-foreground transition"
                >
                  {wizardStep === "done" || wizardStep === "groups" ? "Close" : "Back"}
                </button>
                {wizardStep !== "done" && (
                  <button onClick={() => { if (wizardStep === "groups") { setWizardStep("workspace-map"); return; } if (wizardStep === "workspace-map") { setWizardStep("confirm"); return; } if (wizardStep === "confirm") doSync(); }}
                    disabled={groupsLoading || !!groupsError}
                    className="px-4 py-2 text-sm rounded-lg bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-40 transition flex items-center gap-2"
                  >
                    {wizardStep === "confirm" ? <><RefreshCw className="w-3.5 h-3.5" /> Start sync</> : <>Next <ChevronRight className="w-3.5 h-3.5" /></>}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
