"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  adminApi,
  unwrap,
} from "@/lib/api/ts-rest/client";
import {
  LS_DONE,
  STEP_IDS,
  STEPS,
  loadWizardState,
  saveWizardState,
  type SetupStatus,
  type StepId,
} from "@/components/setup/types";

/**
 * Drives the first-run setup wizard: loads completion state from the backend
 * (falling back to localStorage), tracks the current step, and verifies each
 * step against the backend before advancing.
 */
export function useSetupWizard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<StepId>>(new Set());
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(LS_DONE)) {
      router.replace("/");
      return;
    }
    const load = async () => {
      let backendStatus: SetupStatus | null = null;
      try {
        const data = unwrap(await adminApi.setup.status());
        if (data.status) {
          backendStatus = data.status;
          setCompletedSteps(
            new Set(STEP_IDS.filter((id) => backendStatus![id]))
          );
        }
      } catch {
        /* fall back to localStorage */
      }

      const state = loadWizardState();
      setCurrentIdx(Math.min(state.step, STEP_IDS.length - 1));

      // Only "done" if both localStorage and backend agree every step is complete
      if (
        state.step >= STEP_IDS.length &&
        backendStatus &&
        STEP_IDS.every((id) => backendStatus![id])
      ) {
        setDone(true);
      }
      setLoading(false);
    };
    load();
  }, [router]);

  const currentStep = STEP_IDS[currentIdx];

  /** Jump to any step (preserves completion state). */
  const goToStep = useCallback(
    (idx: number) => {
      if (done) return;
      setCurrentIdx(idx);
      saveWizardState({ step: idx, completed: Array.from(completedSteps) });
    },
    [done, completedSteps]
  );

  /** Verify the current step on the backend, then advance (or finish). */
  const advance = useCallback(async () => {
    try {
      const data = unwrap(await adminApi.setup.status());
      if (!data.status[currentStep]) return; // not actually complete yet
    } catch (err) {
      console.warn("Could not verify setup status:", err);
      return; // require backend confirmation
    }

    const newSet = new Set([...completedSteps, currentStep]);
    setCompletedSteps(newSet);
    const nextIdx = currentIdx + 1;
    saveWizardState({ step: nextIdx, completed: Array.from(newSet) });
    if (nextIdx < STEP_IDS.length) setCurrentIdx(nextIdx);
    else setDone(true);
  }, [completedSteps, currentStep, currentIdx]);

  /** Fully finish — set the done flag and navigate away. */
  const finish = useCallback(
    (target = "/") => {
      localStorage.setItem(LS_DONE, "1");
      router.push(target);
    },
    [router]
  );

  /** Save progress and return to dashboard (banner reappears). */
  const finishLater = useCallback(() => router.push("/"), [router]);

  return {
    loading,
    currentIdx,
    currentStep,
    completedSteps,
    done,
    totalSteps: STEPS.length,
    goToStep,
    advance,
    finish,
    finishLater,
  };
}
