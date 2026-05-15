"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdminWS } from "@/hooks/useAdminWS";
import {
  ArrowLeft,
  Clock,
  CheckCircle,
  XCircle,
  Wifi,
  WifiOff,
  Globe2,
} from "lucide-react";

const AVAILABLE_CAPABILITIES = [
  { id: "file_access", label: "File Access" },
  { id: "internet_access", label: "Internet Access" },
  { id: "browser_control", label: "Browser Control" },
  { id: "api_call", label: "API Call" },
  { id: "mail_send", label: "Mail Send" },
  { id: "code_execution", label: "Code Execution" },
  { id: "system_command", label: "System Command" },
];

interface Realm {
  id: string;
  name: string;
  slug: string;
  color: string;
  is_default: number;
}

function parseUTC(iso: string): Date {
  return new Date(iso.endsWith("Z") ? iso : iso + "Z");
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const seconds = Math.floor((Date.now() - parseUTC(iso).getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function RegistrationsPage() {
  const router = useRouter();
  const { registrations: pendingRegs, connected: wsConnected } = useAdminWS();

  const [selectedCaps, setSelectedCaps] = useState<Record<string, string[]>>({});
  const [selectedRealms, setSelectedRealms] = useState<Record<string, string[]>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [realms, setRealms] = useState<Realm[]>([]);

  useEffect(() => {
    fetch("/api/realms").then((r) => r.json()).then((d) => setRealms(d.realms ?? []));
  }, []);

  // Pre-select requested capabilities for registrations not yet touched by the admin
  useEffect(() => {
    setSelectedCaps((prev) => {
      let updated = prev;
      for (const reg of pendingRegs) {
        if (!(reg.id in updated)) {
          const requested = JSON.parse(reg.requested_capabilities ?? "[]") as string[];
          updated = { ...updated, [reg.id]: requested };
        }
      }
      return updated;
    });
    // Pre-select default realm
    setSelectedRealms((prev) => {
      let updated = prev;
      for (const reg of pendingRegs) {
        if (!(reg.id in updated)) {
          const defaultRealm = realms.find((r) => r.is_default === 1);
          updated = { ...updated, [reg.id]: defaultRealm ? [defaultRealm.id] : [] };
        }
      }
      return updated;
    });
  }, [pendingRegs, realms]);

  function toggleCapability(regId: string, capId: string) {
    setSelectedCaps((prev) => {
      const current = prev[regId] ?? [];
      return current.includes(capId)
        ? { ...prev, [regId]: current.filter((c) => c !== capId) }
        : { ...prev, [regId]: [...current, capId] };
    });
  }

  function toggleRealm(regId: string, realmId: string) {
    setSelectedRealms((prev) => {
      const current = prev[regId] ?? [];
      return current.includes(realmId)
        ? { ...prev, [regId]: current.filter((r) => r !== realmId) }
        : { ...prev, [regId]: [...current, realmId] };
    });
  }

  async function approveRegistration(regId: string) {
    const caps = selectedCaps[regId] ?? [];
    if (caps.length === 0) {
      alert("Select at least one capability before approving.");
      return;
    }
    setActionLoading(regId);
    try {
      const res = await fetch(`/api/registrations/${regId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capabilities: caps, realmIds: selectedRealms[regId] ?? [] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        alert(data.error ?? "Failed to approve");
      }
    } catch {
      alert("Network error");
    } finally {
      setActionLoading(null);
    }
  }

  async function rejectRegistration(regId: string) {
    setActionLoading(regId);
    try {
      const res = await fetch(`/api/registrations/${regId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Rejected by admin" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        alert(data.error ?? "Failed to reject");
      }
    } catch {
      alert("Network error");
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="p-6 w-full max-w-7xl mx-auto space-y-6">
      {/* Back nav */}
      <button
        onClick={() => router.push("/")}
        className="flex items-center gap-1.5 text-vc-muted hover:text-vc-text text-sm transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-vc-text">Pending Registrations</h1>
          <p className="text-vc-muted text-sm mt-0.5">
            Review and approve or reject agents waiting to join.
          </p>
        </div>
        <span
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${wsConnected
            ? "bg-green-100 dark:bg-green-900/40 border-green-300 dark:border-green-700/50 text-green-700 dark:text-green-400"
            : "bg-vc-raised border-vc-border text-vc-subtle"
            }`}
        >
          {wsConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {wsConnected ? "Live" : "Connecting…"}
        </span>
      </div>

      {/* Empty state */}
      {pendingRegs.length === 0 && (
        <div className="bg-vc-surface border border-vc-border rounded-2xl px-6 py-16 text-center">
          <Clock className="w-10 h-10 text-vc-ring mx-auto mb-3" />
          <p className="text-vc-text font-medium">No pending registrations</p>
          <p className="text-vc-muted text-sm mt-1">
            New agent registration requests will appear here.
          </p>
        </div>
      )}

      {/* Registration cards */}
      {pendingRegs.length > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/40 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-yellow-200 dark:border-yellow-700/40 flex items-center gap-2">
            <Clock className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
            <h2 className="text-sm font-semibold text-yellow-700 dark:text-yellow-300">
              {pendingRegs.length} agent{pendingRegs.length !== 1 ? "s" : ""} awaiting review
            </h2>
          </div>
          <div className="divide-y divide-yellow-200 dark:divide-yellow-700/30">
            {pendingRegs.map((reg) => (
              <div key={reg.id} className="px-5 py-5">
                <div className="flex justify-between items-start mb-4 gap-3">
                  <div>
                    <p className="font-semibold text-vc-text">{reg.agent_name}</p>
                    <p className="text-yellow-600/80 dark:text-yellow-400/60 text-xs mt-0.5">
                      Requested {timeAgo(reg.created_at)}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => approveRegistration(reg.id)}
                      disabled={actionLoading === reg.id}
                      className="flex items-center gap-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      {actionLoading === reg.id ? "…" : "Approve"}
                    </button>
                    <button
                      onClick={() => rejectRegistration(reg.id)}
                      disabled={actionLoading === reg.id}
                      className="flex items-center gap-1.5 bg-red-500 hover:bg-red-600 dark:bg-red-800/60 dark:hover:bg-red-700/60 disabled:opacity-50 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Reject
                    </button>
                  </div>
                </div>

                {/* Capabilities */}
                <p className="text-xs text-vc-muted uppercase tracking-wider font-medium mb-2">
                  Grant capabilities
                </p>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {AVAILABLE_CAPABILITIES.map((cap) => {
                    const isSelected = (selectedCaps[reg.id] ?? []).includes(cap.id);
                    const isRequested = (JSON.parse(reg.requested_capabilities ?? "[]") as string[]).includes(cap.id);
                    return (
                      <button
                        key={cap.id}
                        onClick={() => toggleCapability(reg.id, cap.id)}
                        title={isRequested && !isSelected ? "Requested by agent" : undefined}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${isSelected
                          ? "bg-indigo-600 border-indigo-500 text-white"
                          : isRequested
                            ? "bg-vc-raised border-indigo-400/60 text-vc-text-2 hover:border-vc-muted"
                            : "bg-vc-raised border-vc-ring text-vc-text-2 hover:border-vc-muted"
                          }`}
                      >
                        {cap.label}
                        {isRequested && !isSelected && (
                          <span className="ml-1 text-indigo-400">·</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {(JSON.parse(reg.requested_capabilities ?? "[]") as string[]).length > 0 && (
                  <p className="text-xs text-vc-subtle mb-4">
                    <span className="inline-block w-2 h-2 rounded-sm border border-indigo-400/60 bg-vc-raised mr-1 align-middle" />
                    Highlighted capabilities were requested by the agent
                  </p>
                )}

                {/* Realms */}
                {realms.length > 0 && (
                  <>
                    <p className="text-xs text-vc-muted uppercase tracking-wider font-medium mb-2 flex items-center gap-1">
                      <Globe2 className="w-3 h-3" /> Assign to realms
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {realms.map((realm) => {
                        const isSelected = (selectedRealms[reg.id] ?? []).includes(realm.id);
                        return (
                          <button
                            key={realm.id}
                            onClick={() => toggleRealm(reg.id, realm.id)}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${isSelected
                              ? "text-white border-transparent"
                              : "bg-vc-raised border-vc-ring text-vc-text-2 hover:border-vc-muted"
                              }`}
                            style={isSelected ? { backgroundColor: realm.color, borderColor: realm.color } : {}}
                          >
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: isSelected ? "white" : realm.color, opacity: isSelected ? 0.8 : 1 }}
                            />
                            {realm.name}
                            {realm.is_default === 1 && (
                              <span className={`text-xs ${isSelected ? "opacity-70" : "text-vc-subtle"}`}>(default)</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
