"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Loader2,
  Smartphone,
  Fingerprint,
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  Check,
  X,
} from "lucide-react";

interface DeviceInfo {
  id: string;
  did: string;
  name: string | null;
}

interface InteractionLog {
  intentId: string;
  agentDid: string | null;
  action: string;
  decision: string;
  reason: string | null;
  signature: string | null;
  verified: boolean;
  sentAt: string;
}

export default function DeviceDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { status } = useSession();

  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [logs, setLogs] = useState<InteractionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const r = await fetch(`/api/user/devices/${id}/logs`);
      if (r.status === 401) {
        router.replace("/login");
        return;
      }
      if (r.status === 404) throw new Error("Device not found");
      if (!r.ok) throw new Error("Failed to load device activity");
      const data = (await r.json()) as { device: DeviceInfo; logs: InteractionLog[] };
      setDevice(data.device);
      setLogs(data.logs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load device activity");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    load();
  }, [status, load, router]);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <Link
        href="/settings/devices"
        className="inline-flex items-center gap-1.5 text-sm text-foreground-500 hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Linked devices
      </Link>

      {loading ? (
        <div className="flex items-center gap-2 text-foreground-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : error ? (
        <p className="text-danger-600 text-sm">{error}</p>
      ) : (
        <>
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-primary-600" />
              {device?.name || "Unnamed device"}
            </h1>
            <div className="flex items-center gap-1.5 text-xs text-foreground-500 font-mono mt-2 break-all">
              <Fingerprint className="w-3 h-3 shrink-0" />
              {device?.did}
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3">
              Interactions ({logs.length})
            </h2>
            {logs.length === 0 ? (
              <div className="bg-background-100 border border-neutral-200 rounded-2xl p-8 text-center text-foreground-500 text-sm">
                No interactions recorded for this device yet.
              </div>
            ) : (
              <div className="space-y-2">
                {logs.map((log) => {
                  const denied = log.decision === "DENY";
                  return (
                    <div
                      key={log.intentId}
                      className="bg-background-100 border border-neutral-200 rounded-xl p-4 flex items-start justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                              denied
                                ? "bg-danger-100 text-danger-700"
                                : "bg-success-100 text-success-700"
                            }`}
                          >
                            {denied ? (
                              <X className="w-3 h-3" />
                            ) : (
                              <Check className="w-3 h-3" />
                            )}
                            {log.decision}
                          </span>
                          <span className="font-mono text-sm text-foreground">
                            {log.action}
                          </span>
                        </div>
                        {log.agentDid && (
                          <div className="text-xs text-foreground-500 font-mono mt-1 break-all">
                            agent: {log.agentDid}
                          </div>
                        )}
                        {log.reason && (
                          <div className="text-xs text-foreground-500 mt-1">
                            {log.reason}
                          </div>
                        )}
                        <div className="text-xs text-foreground-500 mt-1">
                          {new Date(log.sentAt).toLocaleString()}
                        </div>
                      </div>
                      <span
                        title={log.verified ? "Signature verified" : "Unverified"}
                        className={`inline-flex items-center gap-1 text-xs shrink-0 ${
                          log.verified ? "text-success-600" : "text-foreground-500"
                        }`}
                      >
                        {log.verified ? (
                          <ShieldCheck className="w-4 h-4" />
                        ) : (
                          <ShieldAlert className="w-4 h-4" />
                        )}
                        {log.verified ? "verified" : "unverified"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
