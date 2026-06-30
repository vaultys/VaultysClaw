"use client";

import { useState } from "react";
import { RegisterModelForm } from "@/components/models/RegisterModelForm";
import { StepFooter } from "./ui";

export function ModelStep({ onNext }: { onNext: () => void }) {
  const [hasModels, setHasModels] = useState(false);

  return (
    <div className="space-y-5">
      <p className="text-foreground-500 text-sm leading-relaxed">
        Connect an LLM so your agents can reason and act. You can register more
        models later from the Models page.
      </p>

      <RegisterModelForm
        layout="grid"
        showExistingModels
        onAdded={() => setHasModels(true)}
      />

      <StepFooter>
        {hasModels && (
          <button
            type="button"
            onClick={onNext}
            className="flex items-center gap-2 px-5 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-xl transition-colors"
          >
            Continue →
          </button>
        )}
      </StepFooter>
    </div>
  );
}
