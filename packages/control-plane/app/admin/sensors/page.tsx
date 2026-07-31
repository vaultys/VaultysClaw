"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";
import { Wifi, WifiOff, Monitor, Shield, ShieldCheck, Cpu, Users2 } from "lucide-react";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import { StatCard } from "@/components/governance/StatCard";
import { SensorsTable } from "@/components/sensors/SensorsTable";
import { UsersPagination } from "@/components/users/UsersPagination";
import { adminApi, userApi, unwrap, ApiError } from "@/lib/api/ts-rest/client";
import type {
  SensorDeviceInfo,
  SensorStats,
  ListSensorsQuery,
  UserListItem,
} from "@/lib/contracts";

export default function SensorsPage() {
  const router = useRouter();

  const [sensors, setSensors] = useState<SensorDeviceInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState<SensorStats | null>(null);
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [workspaces, setWorkspaces] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [assigningDid, setAssigningDid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSensors = useCallback(async (query: ListSensorsQuery) => {
    setLoading(true);
    try {
      const data = unwrap(await adminApi.sensors.search({ query }));
      setSensors(data.items);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load sensors");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      setStats(unwrap(await adminApi.sensors.stats()));
    } catch {
      // stats are a nice-to-have — don't block the page on failure
    }
  }, []);

  useEffect(() => {
    // Org-wide user list for the assign-to-user picker. pageSize is generous
    // since this feeds a plain <select> rather than a paginated view.
    adminApi.users
      .list({ query: { pageSize: 500 } })
      .then((r) => setUsers(unwrap(r).users))
      .catch(() => setUsers([]));
    userApi.workspaces
      .list()
      .then((r) => setWorkspaces(unwrap(r).workspaces))
      .catch(() => setWorkspaces([]));
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => {
        fetchSensors({ search: search || undefined, page });
      },
      search ? 300 : 0
    );
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page, fetchSensors]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  async function handleAssign(did: string, userId: string | null) {
    setAssigningDid(did);
    setError(null);
    try {
      const updated = unwrap(
        await adminApi.sensors.assignUser({
          params: { did },
          body: { assignedUserId: userId },
        })
      );
      setSensors((prev) => prev.map((s) => (s.did === did ? updated : s)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to assign sensor");
    } finally {
      setAssigningDid(null);
    }
  }

  async function handleAssignWorkspace(did: string, workspaceId: string | null) {
    setAssigningDid(did);
    setError(null);
    try {
      const updated = unwrap(
        await adminApi.sensors.assignUser({
          params: { did },
          body: { workspaceId },
        })
      );
      setSensors((prev) => prev.map((s) => (s.did === did ? updated : s)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to assign workspace");
    } finally {
      setAssigningDid(null);
    }
  }

  useBreadcrumbs([{ label: "Sensors" }], []);

  useToolbar(
    {
      title: "Sensors",
      description:
        total > 0
          ? `${total} sensor${total !== 1 ? "s" : ""} registered`
          : "Endpoint devices reporting AI usage across your org",
      search: {
        value: search,
        onChange: (v) => {
          setSearch(v);
          setPage(1);
        },
        placeholder: "Search sensors…",
      },
      actions: [
        {
          kind: "badge",
          id: "count",
          label: `${stats?.onlineSensors ?? 0} online`,
          tone: "success",
          icon: <Wifi className="w-3 h-3" />,
        },
      ],
    },
    [total, search, stats]
  );

  return (
    <div className="p-6 w-full max-w-7xl mx-auto space-y-6">
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <StatCard
            icon={<Monitor className="w-4 h-4" />}
            label="Sensors"
            value={stats.totalSensors}
          />
          <StatCard
            icon={<Wifi className="w-4 h-4" />}
            label="Online now"
            value={stats.onlineSensors}
            tone="ok"
          />
          <StatCard
            icon={<Cpu className="w-4 h-4" />}
            label="AI workloads"
            value={stats.totalWorkloads}
          />
          <StatCard
            icon={<ShieldCheck className="w-4 h-4" />}
            label="Managed"
            value={stats.managedWorkloads}
            tone="ok"
          />
          <StatCard
            icon={<Shield className="w-4 h-4" />}
            label="Shadow agents"
            value={stats.shadowWorkloads}
            tone={stats.shadowWorkloads > 0 ? "warn" : "neutral"}
          />
          <StatCard
            icon={<Users2 className="w-4 h-4" />}
            label="Unassigned"
            value={stats.unassignedSensors}
            tone={stats.unassignedSensors > 0 ? "warn" : "ok"}
          />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-danger-50 border border-danger-300 rounded-lg px-4 py-3 text-sm text-danger-600">
          {error}
        </div>
      )}

      {!loading && sensors.length === 0 ? (
        <div className="bg-background-100 border border-neutral-200 rounded-2xl px-6 py-16 text-center">
          <WifiOff className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
          <p className="text-foreground font-medium">No sensors yet</p>
          <p className="text-foreground-500 text-sm mt-1">
            Install vaultysclaw-sensor on a machine and approve its connection
            under Registrations to see it here.
          </p>
        </div>
      ) : (
        <div className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
          <SensorsTable
            sensors={sensors}
            users={users}
            workspaces={workspaces}
            assigningDid={assigningDid}
            onAssign={handleAssign}
            onAssignWorkspace={handleAssignWorkspace}
            onRowClick={(s) => router.push(`/admin/sensors/${s.did}`)}
          />
          <UsersPagination
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={20}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}
