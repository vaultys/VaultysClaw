"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Check, Loader2, AlertCircle, Smartphone, X } from "lucide-react";

interface LinkRequest {
  id: string;
  status: "pending" | "approved" | "rejected" | "expired";
  name: string | null;
  did: string;
}

type Phase = "loading" | "ready" | "working" | "done" | "error";

export default function DeviceLinkApprovalPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { status: authStatus } = useSession();

  const [phase, setPhase] = useState<Phase>("loading");
  const [req, setReq] = useState<LinkRequest | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<"approved" | "rejected" | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const r = await fetch(`/api/user/devices/link/${id}`);
      if (!r.ok) throw new Error("Link request not found");
      const data = (await r.json()) as LinkRequest;
      setReq(data);
      setPhase("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load request");
      setPhase("error");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const act = useCallback(
    async (action: "approve" | "reject") => {
      if (!id) return;
      setPhase("working");
      try {
        const r = await fetch(`/api/user/devices/link/${id}/${action}`, {
          method: "POST",
        });
        if (!r.ok) {
          const body = (await r.json()) as { error?: string };
          throw new Error(body.error ?? `Failed to ${action}`);
        }
        setResult(action === "approve" ? "approved" : "rejected");
        setPhase("done");
      } catch (e) {
        setError(e instanceof Error ? e.message : `Failed to ${action}`);
        setPhase("error");
      }
    },
    [id]
  );

  const deviceLabel = req?.name || "Unnamed device";
  const shortDid = req ? `${req.did.slice(0, 24)}…` : "";

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {phase === "loading" && (
          <div className="bg-background-100 border border-neutral-200 rounded-2xl p-8 shadow-sm text-center space-y-4">
            <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
            <p className="text-foreground-500">Loading link request…</p>
          </div>
        )}

        {phase === "error" && (
          <div className="bg-background-100 border border-neutral-200 rounded-2xl p-8 shadow-sm text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-danger-100 border border-danger-300 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6 text-danger-600" />
            </div>
            <p className="text-foreground-500">{error}</p>
          </div>
        )}

        {(phase === "ready" || phase === "working") && req && (
          <div className="bg-background-100 border border-neutral-200 rounded-2xl p-8 shadow-sm space-y-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-primary-600 rounded-xl flex items-center justify-center mx-auto mb-4 shadow shadow-primary-600/30">
                <Smartphone className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">
                Link a device identity
              </h1>
              <p className="text-foreground-500 text-sm mt-2">
                Approve linking this VaultysId to your profile. Once linked, it
                can interact with the API in your name.
              </p>
            </div>

            {req.status !== "pending" ? (
              <div className="bg-background-200 rounded-xl p-4 text-center text-sm text-foreground-500">
                This request is <strong>{req.status}</strong>.
              </div>
            ) : (
              <>
                <div className="space-y-2 bg-background-200 rounded-xl p-4">
                  <div className="flex justify-between items-start text-sm">
                    <span className="text-foreground-500">Device</span>
                    <span className="font-medium text-foreground text-right">
                      {deviceLabel}
                    </span>
                  </div>
                  <div className="flex justify-between items-start text-sm">
                    <span className="text-foreground-500">VaultysId</span>
                    <span className="font-mono text-xs text-foreground text-right break-all">
                      {shortDid}
                    </span>
                  </div>
                </div>

                {authStatus === "unauthenticated" ? (
                  <button
                    onClick={() => router.push("/login")}
                    className="w-full px-4 py-3 bg-primary-600 hover:bg-primary-500 text-white font-medium rounded-xl transition-colors"
                  >
                    Sign in to approve
                  </button>
                ) : (
                  <div className="flex gap-3">
                    <button
                      disabled={phase === "working"}
                      onClick={() => act("reject")}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-background-200 hover:bg-background-300 text-foreground font-medium rounded-xl transition-colors disabled:opacity-50"
                    >
                      <X className="w-4 h-4" /> Reject
                    </button>
                    <button
                      disabled={phase === "working"}
                      onClick={() => act("approve")}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary-600 hover:bg-primary-500 text-white font-medium rounded-xl transition-colors disabled:opacity-50"
                    >
                      {phase === "working" ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      Approve
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {phase === "done" && (
          <div className="bg-background-100 border border-neutral-200 rounded-2xl p-8 shadow-sm text-center space-y-4">
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto border ${
                result === "approved"
                  ? "bg-success-100 border-success-300"
                  : "bg-background-200 border-neutral-200"
              }`}
            >
              {result === "approved" ? (
                <Check className="w-6 h-6 text-success-600" />
              ) : (
                <X className="w-6 h-6 text-foreground-500" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">
                {result === "approved" ? "Device linked!" : "Request rejected"}
              </h2>
              <p className="text-foreground-500 text-sm mt-2">
                {result === "approved"
                  ? "The device can now finish signing in. You can manage linked devices in settings."
                  : "The link request was declined."}
              </p>
            </div>
            <button
              onClick={() => router.push("/settings/devices")}
              className="w-full px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white font-medium rounded-xl transition-colors"
            >
              Manage linked devices
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
