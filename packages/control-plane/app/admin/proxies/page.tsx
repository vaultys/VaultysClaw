"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Waypoints, CircleDot, Circle, Plus } from "lucide-react";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import { adminApi, unwrap } from "@/lib/api/ts-rest/client";
import { shortDid, timeAgo } from "@vaultysclaw/shared";
import type { ProxyInfo } from "@/lib/contracts";

export default function ProxiesPage() {
  const router = useRouter();
  const [proxies, setProxies] = useState<ProxyInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProxies = useCallback(async () => {
    setLoading(true);
    try {
      const data = unwrap(await adminApi.proxies.list());
      setProxies(data);
    } catch {
      // ignore fetch errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProxies();
  }, [fetchProxies]);

  const onlineCount = proxies.filter((p) => p.online).length;

  useBreadcrumbs([{ label: "Proxies" }], []);
  useToolbar(
    {
      title: "Proxies",
      description: `${proxies.length} registered · ${onlineCount} online`,
      actions: [
        {
          kind: "button",
          id: "create",
          label: "Add proxy",
          variant: "primary",
          icon: <Plus className="w-3.5 h-3.5" />,
          onClick: () => router.push("/admin/proxies/create"),
        },
      ],
    },
    [proxies.length, onlineCount, router]
  );

  return (
    <div className="p-6 w-full max-w-7xl mx-auto space-y-5">
      <div className="bg-background-100 rounded-xl border border-neutral-200 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : proxies.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <Waypoints className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
            <p className="text-foreground-500 mb-1">No proxies registered yet</p>
            <p className="text-foreground-400 text-sm">
              Run <code className="font-mono">pnpm proxy:dev</code> pointed at this
              control plane, then approve it under Registrations.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs font-medium text-foreground-400 uppercase tracking-wider">
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">DID</th>
                  <th className="px-5 py-3">Default mode</th>
                  <th className="px-5 py-3">Last seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {proxies.map((proxy) => (
                  <tr
                    key={proxy.did}
                    className="hover:bg-background-200/40 transition-colors cursor-pointer"
                    onClick={() =>
                      router.push(`/admin/proxies/${encodeURIComponent(proxy.did)}`)
                    }
                  >
                    <td className="px-5 py-3.5">
                      {proxy.online ? (
                        <span className="flex items-center gap-1.5 text-success-600 text-xs">
                          <CircleDot className="w-3.5 h-3.5" /> Online
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-foreground-400 text-xs">
                          <Circle className="w-3.5 h-3.5" /> Offline
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 font-medium text-foreground">
                      {proxy.name}
                    </td>
                    <td className="px-5 py-3.5 text-foreground-500 font-mono text-xs">
                      <span title={proxy.did}>{shortDid(proxy.did)}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded font-medium border ${
                          proxy.defaultMode === "passthrough"
                            ? "bg-warning-100 text-warning-700 border-warning-300"
                            : "bg-background-200 text-foreground-600 border-neutral-300"
                        }`}
                      >
                        {proxy.defaultMode}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-foreground-500 text-xs">
                      {timeAgo(proxy.lastSeen)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
