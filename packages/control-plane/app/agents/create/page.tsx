"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAdminWS } from "@/hooks/useAdminWS";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import { agentsClient, unwrap } from "@/lib/api/ts-rest/client";
import { SkillConfig } from "@vaultysclaw/shared";
import {
  STEPS,
  STEP_INDEX,
  parseJsonArray,
  type WizardStep,
  type PkgRunner,
  type Realm,
  type Model,
  type PendingReg,
  type LiteLlmModel,
} from "@/components/agent/create/constants";
import { LaunchStep } from "@/components/agent/create/LaunchStep";
import { WaitingStep } from "@/components/agent/create/WaitingStep";
import { ApproveStep } from "@/components/agent/create/ApproveStep";
import { ModelStep } from "@/components/agent/create/ModelStep";
import { SkillsStep } from "@/components/agent/create/SkillsStep";
import { VerifyStep } from "@/components/agent/create/VerifyStep";

export default function CreateAgentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { registrations, connected: wsConnected } = useAdminWS();
  const regId = searchParams.get("regId");

  const [step, setStep] = useState<WizardStep>(regId ? "approve" : "launch");
  const [agentName, setAgentName] = useState("");
  const [wsUrl, setWsUrl] = useState("");
  const [connMethod, setConnMethod] = useState<"ws" | "peerjs">("ws");
  const [peerjsId, setPeerjsId] = useState<string | null>(null);
  const [peerjsEnabled, setPeerjsEnabled] = useState(false);
  const [peerjsServerUrl, setPeerjsServerUrl] = useState<string | null>(null);
  const [pkgRunner, setPkgRunner] = useState<PkgRunner>("npx");
  const [realms, setRealms] = useState<Realm[]>([]);
  const [selectedLaunchRealm, setSelectedLaunchRealm] = useState<string>("");

  // Approval state
  const [pendingReg, setPendingReg] = useState<PendingReg | null>(null);
  const [selectedCaps, setSelectedCaps] = useState<Set<string>>(new Set());
  const [selectedRealms, setSelectedRealms] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);

  // Policy form state
  const [policyMaxTokensPerDay, setPolicyMaxTokensPerDay] = useState("");
  const [policyMaxRequestsPerHour, setPolicyMaxRequestsPerHour] = useState("");
  const [policyAllowedDomains, setPolicyAllowedDomains] = useState("");
  const [policyExpiresAt, setPolicyExpiresAt] = useState("");

  // Post-approval state
  const [agentDid, setAgentDid] = useState<string | null>(null);

  // Model state
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [savingModel, setSavingModel] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  // LiteLLM models state
  const [liteLlmModels, setLiteLlmModels] = useState<LiteLlmModel[]>([]);
  const [liteLlmConfigured, setLiteLlmConfigured] = useState(false);
  const [selectedLiteLlmModel, setSelectedLiteLlmModel] = useState<
    string | null
  >(null);
  const [modelMode, setModelMode] = useState<"registry" | "litellm">(
    "registry"
  );

  // Skills state
  const [skills, setSkills] = useState<SkillConfig[]>([]);
  const [savingSkills] = useState(false);

  // Verify state
  const [verifyText, setVerifyText] = useState("");
  const [verifyDone, setVerifyDone] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Track registrations seen before entering waiting step so we can highlight new ones
  const prevRegIds = useRef<Set<string>>(new Set());
  // Merged set of all pending registrations (REST + WS) shown in the waiting step
  const [waitingRegs, setWaitingRegs] = useState<PendingReg[]>([]);

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

  // ── Initial data load ──────────────────────────────────────────────────────

  useEffect(() => {
    // Compute default WS URL from current page origin
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    setWsUrl(`${proto}//${window.location.hostname}:8080`);

    fetch("/api/realms")
      .then((r) => r.json())
      .then((d: { realms?: Realm[] }) => {
        const list = d.realms ?? [];
        setRealms(list);
        const def = list.find((r) => r.isDefault);
        if (def) {
          setSelectedLaunchRealm(def.id);
          setSelectedRealms(new Set([def.id]));
        }
      })
      .catch(() => {});

    fetch("/api/network")
      .then((r) => r.json())
      .then(
        (d: {
          peerjs?: {
            peerId?: string;
            running?: boolean;
            serverUrl?: string | null;
          };
        }) => {
          if (d.peerjs?.peerId) setPeerjsId(d.peerjs.peerId);
          setPeerjsEnabled(d.peerjs?.running ?? false);
          setPeerjsServerUrl(d.peerjs?.serverUrl ?? null);
        }
      )
      .catch(() => {});
  }, []);

  // ── Load registration from regId query param ─────────────────────────────

  useEffect(() => {
    if (!regId || pendingReg) return;
    const reg = registrations.find((r) => r.id === regId);
    if (reg) {
      selectRegistration(reg as PendingReg);
      // Realm selection will use the default (already set in initial load)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regId, registrations, pendingReg]);

  // ── Detect new registrations once waiting ─────────────────────────────────

  useEffect(() => {
    if (step !== "waiting") return;
    const newRegs = registrations.filter(
      (r) => !prevRegIds.current.has(r.id) && r.status === "pending"
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
      if (!pendingReg) {
        selectRegistration(newRegs[0] as PendingReg);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registrations, step, pendingReg]);

  // ── Load models & skills when reaching those steps ─────────────────────────

  useEffect(() => {
    if (step === "model" && models.length === 0) {
      fetch("/api/models")
        .then((r) => r.json())
        .then((d: { models?: Model[] }) => setModels(d.models ?? []))
        .catch(() => {});
    }
    if (step === "model" && liteLlmModels.length === 0) {
      fetch("/api/litellm/models")
        .then((r) => r.json())
        .then((d: { models?: LiteLlmModel[]; configured?: boolean }) => {
          setLiteLlmModels(d.models ?? []);
          setLiteLlmConfigured(d.configured ?? false);
        })
        .catch(() => {});
    }
  }, [step, models.length, liteLlmModels.length]);

  useEffect(() => {
    if (step === "skills" && agentDid && skills.length === 0) {
      agentsClient
        .getSkills({ params: { did: agentDid } })
        .then(unwrap)
        .then((d) => setSkills((d.skills as SkillConfig[] | undefined) ?? []))
        .catch(() => {});
    }
  }, [step, agentDid, skills.length]);

  // ── Auto-verify on entering verify step ───────────────────────────────────

  useEffect(() => {
    if (step !== "verify" || !agentDid || verifyText || verifyDone) return;

    let cancelled = false;
    setVerifyText("");
    setVerifyDone(false);
    setVerifyError(null);

    (async () => {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentDid,
            messages: [
              {
                role: "user",
                content:
                  "List all the tools and skills you currently have access to.",
              },
            ],
          }),
        });
        if (!res.ok || !res.body) {
          setVerifyError(`Agent responded with HTTP ${res.status}`);
          setVerifyDone(true);
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (payload === "[DONE]") {
              setVerifyDone(true);
              return;
            }
            try {
              const parsed = JSON.parse(payload) as {
                text?: string;
                error?: string;
              };
              if (parsed.error) {
                setVerifyError(parsed.error);
                setVerifyDone(true);
                return;
              }
              if (parsed.text) setVerifyText((t) => t + parsed.text);
            } catch {
              /* skip malformed */
            }
          }
        }
        if (!cancelled) setVerifyDone(true);
      } catch (e) {
        if (!cancelled) {
          setVerifyError(
            e instanceof Error ? e.message : "Failed to reach agent"
          );
          setVerifyDone(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [step, agentDid]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function startWaiting() {
    // Snapshot WS-known IDs so genuinely new arrivals can be detected via the effect below
    prevRegIds.current = new Set(registrations.map((r) => r.id));
    setPendingReg(null);
    setStep("waiting");

    // REST-fetch current pending registrations — the WS state may not have delivered them yet
    // (or they existed before the user clicked this button and were filtered by prevRegIds).
    try {
      const res = await fetch("/api/registrations");
      if (!res.ok) return;
      const data = (await res.json()) as { registrations?: PendingReg[] };
      const pending = (data.registrations ?? []).filter(
        (r) => r.status === "pending"
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
      const res = await fetch(`/api/registrations/${pendingReg.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capabilities: Array.from(selectedCaps),
          realmIds: Array.from(selectedRealms),
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        agentDid?: string;
        error?: string;
      };
      if (!res.ok || !data.success) {
        setApproveError(data.error ?? "Approval failed");
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

          const policyBody: Record<string, unknown> = {
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
          };

          const policyRes = await fetch("/api/policies", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(policyBody),
          });
          if (!policyRes.ok) {
            console.error(
              "Failed to create initial policy",
              await policyRes.json().catch(() => ({}))
            );
          }
        } catch (policyError) {
          console.error("Error creating initial policy:", policyError);
        }
      }

      setAgentDid(newAgentDid);
      setStep("model");
    } catch {
      setApproveError("Network error");
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
      const res = await fetch(`/api/registrations/${pendingReg.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Rejected by admin" }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setApproveError(data.error ?? "Rejection failed");
        return;
      }
      router.back();
    } catch {
      setApproveError("Network error");
    } finally {
      setRejecting(false);
    }
  }

  async function saveModel() {
    if (!agentDid) {
      setStep("skills");
      return;
    }

    // If no model selected, skip
    if (modelMode === "registry" && !selectedModel) {
      setStep("skills");
      return;
    }
    if (modelMode === "litellm" && !selectedLiteLlmModel) {
      setStep("skills");
      return;
    }

    setSavingModel(true);
    setModelError(null);
    try {
      if (modelMode === "registry" && selectedModel) {
        unwrap(
          await agentsClient.setLlmConfig({
            params: { did: agentDid },
            body: { registryModelId: selectedModel },
          })
        );
      } else if (modelMode === "litellm" && selectedLiteLlmModel) {
        // Create/validate LiteLLM key for this model
        await fetch(`/api/agents/${agentDid}/litellm-key`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            allowedModels: [selectedLiteLlmModel],
          }),
        }).then((r) => {
          if (!r.ok) throw new Error("Failed to create LiteLLM key");
          return r.json();
        });
      }
      setStep("skills");
    } catch (err) {
      setModelError(
        err instanceof Error ? err.message : "Network error while saving model"
      );
    } finally {
      setSavingModel(false);
    }
  }

  async function toggleSkill(skill: SkillConfig, realmSkillId: string) {
    if (!agentDid || skill.isRequired) return;
    const newEnabled = !skill.enabled;
    setSkills((prev) =>
      prev.map((s) =>
        s.name === skill.name ? { ...s, enabled: newEnabled } : s
      )
    );
    unwrap(
      await agentsClient.updateSkillOverride({
        params: { did: agentDid },
        body: { realmSkillId, enabled: newEnabled },
      })
    );
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
          connMethod={connMethod}
          setConnMethod={setConnMethod}
          wsUrl={wsUrl}
          setWsUrl={setWsUrl}
          peerjsId={peerjsId}
          peerjsEnabled={peerjsEnabled}
          peerjsServerUrl={peerjsServerUrl}
          agentName={agentName}
          setAgentName={setAgentName}
          realms={realms}
          selectedLaunchRealm={selectedLaunchRealm}
          setSelectedLaunchRealm={setSelectedLaunchRealm}
          setSelectedRealms={setSelectedRealms}
          pkgRunner={pkgRunner}
          setPkgRunner={setPkgRunner}
          onContinue={startWaiting}
        />
      )}

      {step === "waiting" && (
        <WaitingStep
          wsConnected={wsConnected}
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
          realms={realms}
          selectedCaps={selectedCaps}
          setSelectedCaps={setSelectedCaps}
          selectedRealms={selectedRealms}
          setSelectedRealms={setSelectedRealms}
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
        <ModelStep
          models={models}
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          liteLlmModels={liteLlmModels}
          liteLlmConfigured={liteLlmConfigured}
          selectedLiteLlmModel={selectedLiteLlmModel}
          setSelectedLiteLlmModel={setSelectedLiteLlmModel}
          modelMode={modelMode}
          setModelMode={setModelMode}
          savingModel={savingModel}
          modelError={modelError}
          onSave={saveModel}
          onSkip={() => setStep("skills")}
        />
      )}

      {step === "skills" && (
        <SkillsStep
          skills={skills}
          savingSkills={savingSkills}
          onToggleSkill={toggleSkill}
          onContinue={() => setStep("verify")}
        />
      )}

      {step === "verify" && (
        <VerifyStep
          verifyText={verifyText}
          verifyDone={verifyDone}
          verifyError={verifyError}
          onRetry={() => {
            setVerifyText("");
            setVerifyDone(false);
            setVerifyError(null);
          }}
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
