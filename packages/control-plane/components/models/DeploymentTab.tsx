import { Server, Link2, Bot } from "lucide-react";
import { ComingSoonOverlay } from "@/components/shared";

export function DeploymentTab() {
  return (
    <ComingSoonOverlay
      title="Kubernetes Deployment"
      description="Connect a Kubernetes cluster in Settings to auto-provision vLLM GPU pods. Karpenter provisions GPU nodes on demand and scales to zero when idle."
    >
      <div className="rounded-2xl border border-neutral-200 bg-background-100 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">
          Deploy to Kubernetes
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            ["Instance type", "g5.xlarge (A10G 24GB)"],
            ["Replicas", "1"],
            ["Scale to zero", "After 15 min idle"],
            ["Namespace", "vaultys-models"],
          ].map(([label, val]) => (
            <div key={label}>
              <p className="text-xs text-foreground-500 mb-1">{label}</p>
              <div className="h-8 bg-background border border-neutral-200 rounded-lg px-3 flex items-center text-sm text-foreground-500">
                {val}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-9 rounded-xl bg-primary-100 border border-primary-300 flex items-center justify-center text-sm text-primary-400 font-medium">
            Deploy to Kubernetes
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-foreground-500 pt-1">
          <span className="flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5" /> vLLM pod
          </span>
          <span>→</span>
          <span className="flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5" /> LiteLLM registered
          </span>
          <span>→</span>
          <span className="flex items-center gap-1.5">
            <Bot className="w-3.5 h-3.5" /> Agents updated
          </span>
        </div>
      </div>
    </ComingSoonOverlay>
  );
}
