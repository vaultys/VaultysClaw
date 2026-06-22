import { ComingSoonOverlay } from "@/components/shared";

export function TrainingTab() {
  return (
    <ComingSoonOverlay
      title="Fine-Tuning Pipeline"
      description="Run Unsloth training jobs as Kubernetes Jobs. Upload your dataset, pick a base model, and track progress — no GPU server to manage."
    >
      <div className="rounded-2xl border border-neutral-200 bg-background-100 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">
          Start Fine-Tuning
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            ["Base model", "meta-llama/Llama-3.1-8B"],
            ["Method", "LoRA (recommended)"],
            ["Epochs", "3"],
            ["Instance", "g5.2xlarge"],
          ].map(([label, val]) => (
            <div key={label}>
              <p className="text-xs text-foreground-500 mb-1">{label}</p>
              <div className="h-8 bg-background border border-neutral-200 rounded-lg px-3 flex items-center text-sm text-foreground-500">
                {val}
              </div>
            </div>
          ))}
        </div>
        <div className="h-24 bg-background border border-neutral-200 border-dashed rounded-xl flex items-center justify-center text-xs text-foreground-500">
          Drop JSONL training data here
        </div>
        <div className="flex items-center justify-between text-xs text-foreground-500 bg-background border border-neutral-200 rounded-xl px-4 py-2.5">
          <span>Estimated cost: ~$4.20 on g5.2xlarge</span>
          <span>Est. time: ~45 min</span>
        </div>
        <div className="h-9 rounded-xl bg-primary-100 border border-primary-300 flex items-center justify-center text-sm text-primary-400 font-medium">
          Start Fine-Tuning
        </div>
      </div>
    </ComingSoonOverlay>
  );
}
