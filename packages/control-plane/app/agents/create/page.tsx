"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAdminWS } from "@/hooks/useAdminWS";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import {
  STEPS,
  STEP_INDEX,
  type WizardStep,
  type PendingReg,
} from "@/components/agent/create/constants";
import {
  policiesClient,
  registrationsClient,
  unwrap,
  ApiError,
} from "@/lib/api/ts-rest/client";
import { LaunchStep } from "@/components/agent/create/LaunchStep";
import { WaitingStep } from "@/components/agent/create/WaitingStep";
import { ApproveStep } from "@/components/agent/create/ApproveStep";
import { ModelStep } from "@/components/agent/create/ModelStep";
import { SkillsStep } from "@/components/agent/create/SkillsStep";
import { VerifyStep } from "@/components/agent/create/VerifyStep";
import { Workspace } from "@prisma/client";
import { parseJsonArray } from "@vaultysclaw/shared";

export default function CreateAgentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { registrations, connected: wsConnected } = useAdminWS();
  const regId = searchParams.get("regId");

  const [step, setStep] = useState<WizardStep>(regId ? "approve" : "launch");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  // Approval state — shared between selectRegistration, the approve handler,
  // and the ApproveStep form.
  const [pendingReg, setPendingReg] = useState<PendingReg | null>(null);
  const [selectedCaps, setSelectedCaps] = useState<Set<string>>(new Set());
  const [selectedWorkspaces, setSelectedWorkspaces] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);

  // Policy form state
  const [policyMaxTokensPerDay, setPolicyMaxTokensPerDay] = useState("");
  const [policyMaxRequestsPerHour, setPolicyMaxRequestsPerHour] = useState("");
  const [policyAllowedDomains, setPolicyAllowedDomains] = useState("");
  const [policyExpiresAt, setPolicyExpiresAt] = useState("");

  // Set once the agent is approved — drives the model/skills/verify steps.
  const [agentDid, setAgentDid] = useState<string | null>(null);

  // Name entered in the Launch step (the agent is launched with `--name <this>`).
  // Used to only surface registrations matching the agent the user just launched.
  const [launchedName, setLaunchedName] = useState("");

  // Track registrations seen before entering waiting step so we can highlight new ones
  const prevRegIds = useRef<Set<string>>(new Set());
  // Merged set of all pending registrations (REST + WS) shown in the waiting step
  const [waitingRegs, setWaitingRegs] = useState<PendingReg[]>([]);

  // Only registrations matching the launched agent name are candidates for
  // approval (when launched via the wizard; the regId deep-link bypasses this).
  const matchesLaunch = (r: PendingReg) =>
    !launchedName || r.agentName === launchedName;

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const resetPolicyFields = () => {
    setPolicyMaxTokensPerDay("");
    setPolicyMaxRequestsPerHour("");
    setPolicyAllowedDomains("");
    setPolicyExpiresAt("");
  };

  // Select a pending registration as the one being reviewed/approved
  const selectRegistration = (reg: PendingReg) => {
    setPendingReg(reg);
    setSelectedCaps(new Set(parseJsonArray(reg.requestedCapabilities)));
    resetPolicyFields();
  };

  // ── Initial data load (workspaces — shared by Launch + Approve) ─────────────────

  useEffect(() => {
    fetch("/api/workspaces")
      .then((r) => r.json())
      .then((d: { workspaces?: Workspace[] }) => {
        const list = d.workspaces ?? [];
        setWorkspaces(list);
        const def = list.find((r) => r.isDefault);
        if (def) setSelectedWorkspaces(new Set([def.id]));
      })
      .catch(() => {});
  }, []);

  // ── Load registration from regId query param ─────────────────────────────

  useEffect(() => {
    if (!regId || pendingReg) return;
    const reg = registrations.find((r) => r.id === regId);
    if (reg) selectRegistration(reg as PendingReg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regId, registrations, pendingReg]);

  // ── Detect new registrations once waiting ─────────────────────────────────

  useEffect(() => {
    if (step !== "waiting") return;
    const newRegs = registrations.filter(
      (r) =>
        !prevRegIds.current.has(r.id) &&
        r.status === "pending" &&
        matchesLaunch(r as PendingReg)
    );
    if (newRegs.length > 0) {
      // Merge new WS-delivered regs into the waiting list
      setWaitingRegs((prev) => {
        const ids = new Set(prev.map((r) => r.id));
        const merged = [
          ...prev,
          ...(newRegs.filter((r) => !ids.has(r.id)) as PendingReg[]),
        ];
        return merged.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      });
      if (!pendingReg) selectRegistration(newRegs[0] as PendingReg);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registrations, step, pendingReg, launchedName]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function startWaiting(agentName: string) {
    // Snapshot WS-known IDs so genuinely new arrivals can be detected via the effect below
    prevRegIds.current = new Set(registrations.map((r) => r.id));
    setLaunchedName(agentName);
    setPendingReg(null);
    setStep("waiting");

    // REST-fetch current pending registrations — the WS state may not have delivered them yet
    // (or they existed before the user clicked this button and were filtered by prevRegIds).
    try {
      const data = unwrap(await registrationsClient.list());
      const pending = (data.registrations as unknown as PendingReg[]).filter(
        (r) => r.status === "pending" && r.agentName === agentName
      );
      if (pending.length === 0) return;
      // Show the most recent pending registration
      const sorted = pending.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setWaitingRegs(sorted);
      selectRegistration(sorted[0]);
      // Add these to prevRegIds so the WS effect doesn't double-set
      prevRegIds.current = new Set([
        ...prevRegIds.current,
        ...pending.map((r) => r.id),
      ]);
    } catch {
      // WS subscription handles live arrivals — this is best-effort
    }
  }

  async function doApprove() {
    if (!pendingReg) return;
    setApproving(true);
    setApproveError(null);
    try {
      const data = unwrap(
        await registrationsClient.approve({
          params: { id: pendingReg.id },
          body: {
            capabilities: Array.from(selectedCaps),
            workspaceIds: Array.from(selectedWorkspaces),
          },
        })
      );
      if (!data.success) {
        setApproveError("Approval failed");
        return;
      }

      const newAgentDid = data.agentDid ?? null;
      if (newAgentDid) {
        // Create initial policy with selected capabilities and resource limits
        try {
          const resourceLimits: Record<string, unknown> = {};
          if (policyMaxTokensPerDay !== "")
            resourceLimits.maxTokensPerDay = Number(policyMaxTokensPerDay);
          if (policyMaxRequestsPerHour !== "")
            resourceLimits.maxRequestsPerHour = Number(
              policyMaxRequestsPerHour
            );
          if (policyAllowedDomains.trim() !== "") {
            resourceLimits.allowedDomains = policyAllowedDomains
              .split(",")
              .map((d) => d.trim())
              .filter(Boolean);
          }

          unwrap(
            await policiesClient.create({
              body: {
                agentDid: newAgentDid,
                capabilities: Array.from(selectedCaps),
                resourceLimits:
                  Object.keys(resourceLimits).length > 0
                    ? resourceLimits
                    : undefined,
                expiresAt:
                  policyExpiresAt !== ""
                    ? new Date(policyExpiresAt).toISOString()
                    : undefined,
              },
            })
          );
        } catch (policyError) {
          console.error("Error creating initial policy:", policyError);
        }
      }

      setAgentDid(newAgentDid);
      setStep("model");
    } catch (err) {
      setApproveError(err instanceof ApiError ? err.message : "Network error");
    } finally {
      setApproving(false);
    }
  }

  async function doReject() {
    if (!pendingReg) return;
    if (
      !confirm(
        `Reject registration for "${pendingReg.agentName}"? This cannot be undone.`
      )
    )
      return;
    setRejecting(true);
    setApproveError(null);
    try {
      unwrap(
        await registrationsClient.reject({
          params: { id: pendingReg.id },
          body: { reason: "Rejected by admin" },
        })
      );
      router.back();
    } catch (err) {
      setApproveError(err instanceof ApiError ? err.message : "Network error");
    } finally {
      setRejecting(false);
    }
  }

  // ── TopBar breadcrumbs + toolbar (title + step indicator) ───────────────────

  useBreadcrumbs(
    [{ label: "Agents", href: "/agents" }, { label: "New agent" }],
    []
  );

  useToolbar(
    {
      title: "Create agent",
      steps: {
        current: STEP_INDEX[step],
        steps: STEPS,
        onStepClick: (i) => setStep(STEPS[i].id),
      },
    },
    [step]
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 w-full max-w-7xl mx-auto">
      {step === "launch" && (
        <LaunchStep
          workspaces={workspaces}
          setSelectedWorkspaces={setSelectedWorkspaces}
          onContinue={startWaiting}
        />
      )}

      {step === "waiting" && (
        <WaitingStep
          wsConnected={wsConnected}
          expectedName={launchedName}
          pendingReg={pendingReg}
          waitingRegs={waitingRegs}
          onSelectReg={selectRegistration}
          onApprove={() => setStep("approve")}
          onBack={() => {
            setStep("launch");
            setWaitingRegs([]);
          }}
        />
      )}

      {step === "approve" && pendingReg && (
        <ApproveStep
          pendingReg={pendingReg}
          workspaces={workspaces}
          selectedCaps={selectedCaps}
          setSelectedCaps={setSelectedCaps}
          selectedWorkspaces={selectedWorkspaces}
          setSelectedWorkspaces={setSelectedWorkspaces}
          policyMaxTokensPerDay={policyMaxTokensPerDay}
          setPolicyMaxTokensPerDay={setPolicyMaxTokensPerDay}
          policyMaxRequestsPerHour={policyMaxRequestsPerHour}
          setPolicyMaxRequestsPerHour={setPolicyMaxRequestsPerHour}
          policyAllowedDomains={policyAllowedDomains}
          setPolicyAllowedDomains={setPolicyAllowedDomains}
          policyExpiresAt={policyExpiresAt}
          setPolicyExpiresAt={setPolicyExpiresAt}
          approveError={approveError}
          approving={approving}
          rejecting={rejecting}
          onApprove={doApprove}
          onReject={doReject}
          onBack={() => setStep("waiting")}
        />
      )}

      {step === "model" && (
        <ModelStep agentDid={agentDid} onDone={() => setStep("skills")} />
      )}

      {step === "skills" && (
        <SkillsStep agentDid={agentDid} onContinue={() => setStep("verify")} />
      )}

      {step === "verify" && (
        <VerifyStep
          agentDid={agentDid}
          onFinish={() =>
            agentDid
              ? router.push(`/agents/${encodeURIComponent(agentDid)}`)
              : router.push("/agents")
          }
        />
      )}
    </div>
  );
}
