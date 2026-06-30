"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2, Trash2, Smartphone, Fingerprint, ChevronRight } from "lucide-react";

interface LinkedDevice {
  id: string;
  did: string;
  name: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export default function LinkedDevicesPage() {
  const router = useRouter();
  const { status } = useSession();
  const [devices, setDevices] = useState<LinkedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/user/devices");
      if (r.status === 401) {
        router.replace("/login");
        return;
      }
      if (!r.ok) throw new Error("Failed to load devices");
      const data = (await r.json()) as { devices: LinkedDevice[] };
      setDevices(data.devices);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load devices");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    load();
  }, [status, load, router]);

  const revoke = useCallback(async (id: string) => {
    const r = await fetch(`/api/user/devices/${id}`, { method: "DELETE" });
    if (r.ok) setDevices((prev) => prev.filter((d) => d.id !== id));
  }, []);

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-primary-600" /> Linked devices
        </h1>
        <p className="text-foreground-500 text-sm mt-1">
          VaultysId identities (e.g. the CLI) linked to your profile. Each can
          interact with the API in your name. Revoke any you no longer use.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-foreground-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : error ? (
        <p className="text-danger-600 text-sm">{error}</p>
      ) : devices.length === 0 ? (
        <div className="bg-background-100 border border-neutral-200 rounded-2xl p-8 text-center text-foreground-500 text-sm">
          No linked devices yet. Run <code className="font-mono">vaultysclaw login</code> to link one.
        </div>
      ) : (
        <div className="space-y-3">
          {devices.map((d) => (
            <div
              key={d.id}
              className="bg-background-100 border border-neutral-200 rounded-xl p-4 flex items-center justify-between gap-4"
            >
              <Link
                href={`/settings/devices/${d.id}`}
                className="min-w-0 flex items-center gap-2 group flex-1"
              >
                <div className="min-w-0">
                  <div className="font-medium text-foreground group-hover:text-primary-700 transition-colors">
                    {d.name || "Unnamed device"}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-foreground-500 font-mono mt-1 break-all">
                    <Fingerprint className="w-3 h-3 shrink-0" />
                    {d.did.slice(0, 32)}…
                  </div>
                  <div className="text-xs text-foreground-500 mt-1">
                    Linked {new Date(d.createdAt).toLocaleDateString()}
                    {d.lastUsedAt
                      ? ` · last used ${new Date(d.lastUsedAt).toLocaleDateString()}`
                      : ""}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-foreground-500 shrink-0 ml-auto" />
              </Link>
              <button
                onClick={() => revoke(d.id)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-danger-600 hover:bg-danger-100 rounded-lg transition-colors shrink-0"
              >
                <Trash2 className="w-4 h-4" /> Revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
