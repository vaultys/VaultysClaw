import Link from "next/link";
import { Key } from "lucide-react";
import type { AgentKeyInfo } from "./constants";
import { DetailRows } from "./DetailRows";

export function AgentKeyView({ agentKeyInfo }: { agentKeyInfo: AgentKeyInfo }) {
  return (
    <div className="divide-y divide-neutral-200">
      <div className="flex items-center gap-3 px-4 py-3 bg-warning-50">
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-warning-100 text-warning-700 border border-warning-300 shrink-0 flex items-center gap-1">
          <Key className="w-3 h-3" /> Agent Key
        </span>
        <span className="text-sm text-foreground font-mono">
          {agentKeyInfo.keyPrefix}…
        </span>
        <Link
          href="/models?tab=litellm"
          className="ml-auto text-xs text-warning-600 hover:underline shrink-0"
        >
          LiteLLM proxy →
        </Link>
      </div>
      <DetailRows
        rows={[
          {
            label: "Models",
            value:
              agentKeyInfo.allowedModels.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {agentKeyInfo.allowedModels.map((m) => (
                    <code
                      key={m}
                      className="text-xs font-mono bg-background-200 px-1.5 py-0.5 rounded border border-neutral-200"
                    >
                      {m}
                    </code>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-foreground-400">
                  inherited from realm
                </span>
              ),
          },
          {
            label: "Daily budget",
            value:
              agentKeyInfo.dailyBudget != null ? (
                <span className="text-xs font-medium">
                  ${agentKeyInfo.dailyBudget.toFixed(2)} / day
                </span>
              ) : (
                <span className="text-xs text-foreground-400">No limit</span>
              ),
          },
          {
            label: "Updated",
            value: agentKeyInfo.updatedAt ? (
              <span className="text-xs text-foreground-500">
                {new Date(agentKeyInfo.updatedAt).toLocaleString()}
              </span>
            ) : (
              <span className="text-xs text-foreground-400">—</span>
            ),
          },
        ]}
      />
    </div>
  );
}
