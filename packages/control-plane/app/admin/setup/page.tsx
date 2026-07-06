"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRole } from "@/hooks/useRole";
import { useSetupWizard } from "@/hooks/useSetupWizard";
import { STEPS, STEP_IDS } from "@/components/setup/types";
import { Sidebar } from "@/components/setup/Sidebar";
import { StepProgress } from "@/components/setup/StepProgress";
import { ModelStep } from "@/components/setup/ModelStep";
import { EmailStep } from "@/components/setup/EmailStep";
import { UsersStep } from "@/components/setup/UsersStep";
import { AgentStep } from "@/components/setup/AgentStep";
import { DoneStep } from "@/components/setup/DoneStep";

export default function SetupPage() {
  const router = useRouter();
  const { isGlobalAdmin, isLoading: roleLoading } = useRole();
  const {
    loading,
    currentIdx,
    currentStep,
    completedSteps,
    done,
    totalSteps,
    goToStep,
    advance,
    finish,
    finishLater,
  } = useSetupWizard();

  useEffect(() => {
    if (!roleLoading && !isGlobalAdmin) router.replace("/");
  }, [isGlobalAdmin, roleLoading, router]);

  if (roleLoading || !isGlobalAdmin || loading) return null;

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-primary-50/70 via-background to-secondary-50/40">
      {/* Ambient blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[450px] bg-primary-200/40 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-secondary-200/30 rounded-full blur-3xl" />
      </div>

      <Sidebar
        currentIdx={currentIdx}
        done={done}
        completedSteps={completedSteps}
        onGoToStep={goToStep}
        onFinishLater={finishLater}
      />

      <div className="relative flex-1 flex flex-col min-h-screen">
        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between px-5 py-4 bg-background-100 border-b border-neutral-200">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-primary-600 rounded-lg flex items-center justify-center text-xs shadow shadow-primary-600/30">
              🦞
            </div>
            <span className="font-bold text-foreground text-sm">
              VaultysClaw Setup
            </span>
          </div>
          <button
            onClick={finishLater}
            className="text-xs text-foreground-500 hover:text-foreground border border-neutral-200 hover:bg-background-200 px-3 py-1.5 rounded-lg transition-colors"
          >
            Finish later
          </button>
        </header>

        <div className="flex-1 flex flex-col items-center p-6 md:p-12 pt-10 md:pt-14">
          <div className="w-full max-w-2xl animate-fade-in-up">
            {done ? (
              <DoneStep onClose={() => finish("/")} />
            ) : (
              <>
                <div className="mb-1">
                  <span className="text-foreground-400 text-xs font-semibold uppercase tracking-widest">
                    Step {currentIdx + 1} of {totalSteps}
                  </span>
                </div>
                <h1 className="text-3xl font-bold text-foreground mb-1">
                  {STEPS[currentIdx].label}
                </h1>
                <p className="text-foreground-500 text-sm mb-8">
                  {STEPS[currentIdx].desc}
                </p>

                <StepProgress
                  currentIdx={currentIdx}
                  completedSteps={completedSteps}
                />

                <div className="bg-background-100 border border-neutral-200 rounded-2xl p-6 shadow-sm">
                  {currentStep === "model" && <ModelStep onNext={advance} />}
                  {currentStep === "email" && <EmailStep onNext={advance} />}
                  {currentStep === "users" && <UsersStep onNext={advance} />}
                  {currentStep === "agent" && <AgentStep onNext={advance} />}
                </div>

                {/* Mobile step dots */}
                <div className="flex items-center justify-center gap-2 mt-5 md:hidden">
                  {STEP_IDS.map((id, i) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => goToStep(i)}
                      className={`rounded-full transition-all ${
                        i === currentIdx
                          ? "w-4 h-2 bg-primary-500"
                          : i < currentIdx
                            ? "w-2 h-2 bg-primary-400/60"
                            : "w-2 h-2 bg-neutral-200"
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
