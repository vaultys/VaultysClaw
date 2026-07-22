"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAdminWS } from "@/hooks/useAdminWS";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import {
  STEPS,
  STEP_INDEX,
  type WizardStep,
  type PendingReg,
} from "@/components/proxy/create/constants";
import { adminApi, unwrap, ApiError } from "@/lib/api/ts-rest/client";
import { LaunchStep } from "@/components/proxy/create/LaunchStep";
import { WaitingStep } from "@/components/proxy/create/WaitingStep";

export default function CreateProxyPage() {
  const router = useRouter();
  const { registrations, connected: wsConnected } = useAdminWS();

  const [step, setStep] = useState<WizardStep>("launch");
  const [pendingReg, setPendingReg] = useState<PendingReg | null>(null);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  // Name entered in the Launch step. Only registrations matching it (and
  // kind:"proxy") are surfaced as candidates in the Waiting step.
  const [launchedName, setLaunchedName] = useState("");

  const prevRegIds = useRef<Set<string>>(new Set());
  const [waitingRegs, setWaitingRegs] = useState<PendingReg[]>([]);

  const matchesLaunch = (r: PendingReg) =>
    r.kind === "proxy" && (!launchedName || r.agentName === launchedName);

  async function startWaiting(proxyName: string) {
    prevRegIds.current = new Set(registrations.map((r) => r.id));
    setLaunchedName(proxyName);
    setPendingReg(null);
    setStep("waiting");

    try {
      const data = unwrap(await adminApi.registrations.list());
      const pending = (data.registrations as unknown as PendingReg[]).filter(
        (r) => r.status === "pending" && r.kind === "proxy" && r.agentName === proxyName
      );
      if (pending.length === 0) return;
      const sorted = pending.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setWaitingRegs(sorted);
      setPendingReg(sorted[0]);
      prevRegIds.current = new Set([...prevRegIds.current, ...pending.map((r) => r.id)]);
    } catch {
      // WS subscription handles live arrivals — this is best-effort
    }
  }

  useEffect(() => {
    if (step !== "waiting") return;
    const newRegs = registrations.filter(
      (r) =>
        !prevRegIds.current.has(r.id) && r.status === "pending" && matchesLaunch(r as PendingReg)
    );
    if (newRegs.length > 0) {
      setWaitingRegs((prev) => {
        const ids = new Set(prev.map((r) => r.id));
        const merged = [...prev, ...(newRegs.filter((r) => !ids.has(r.id)) as PendingReg[])];
        return merged.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      });
      if (!pendingReg) setPendingReg(newRegs[0] as PendingReg);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registrations, step, pendingReg, launchedName]);

  async function doApprove() {
    if (!pendingReg) return;
    setApproving(true);
    setApproveError(null);
    try {
      const data = unwrap(
        await adminApi.registrations.approve({
          params: { id: pendingReg.id },
          body: { capabilities: [] },
        })
      );
      if (!data.success) {
        setApproveError("Approval failed");
        return;
      }
      if (data.agentDid) {
        router.push(`/admin/proxies/${encodeURIComponent(data.agentDid)}`);
      } else {
        router.push("/admin/proxies");
      }
    } catch (err) {
      setApproveError(err instanceof ApiError ? err.message : "Network error");
    } finally {
      setApproving(false);
    }
  }

  useBreadcrumbs(
    [{ label: "Proxies", href: "/admin/proxies" }, { label: "New proxy" }],
    []
  );
  useToolbar(
    {
      title: "Create proxy",
      steps: {
        current: STEP_INDEX[step],
        steps: STEPS,
        onStepClick: (i) => setStep(STEPS[i].id),
      },
    },
    [step]
  );

  return (
    <div className="p-6 w-full max-w-7xl mx-auto">
      {step === "launch" && <LaunchStep onContinue={startWaiting} />}

      {step === "waiting" && (
        <WaitingStep
          wsConnected={wsConnected}
          expectedName={launchedName}
          pendingReg={pendingReg}
          waitingRegs={waitingRegs}
          approving={approving}
          approveError={approveError}
          onSelectReg={setPendingReg}
          onApprove={doApprove}
          onBack={() => {
            setStep("launch");
            setWaitingRegs([]);
          }}
        />
      )}
    </div>
  );
}
