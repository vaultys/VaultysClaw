"use client";

import { useRouter } from "next/navigation";
import {
  Bot,
  ChevronRight,
  Cpu,
  GitBranch,
  Globe,
  Layers,
  Network,
} from "lucide-react";
import { timeAgo } from "@vaultysclaw/shared";
import type { WorkflowRunWithName } from "@/lib/contracts";
import { RunStatusBadge } from "./RunStatusBadge";

const EXPLORE_LINKS = [
  { icon: Bot, label: "Agents", path: "/agents" },
  { icon: GitBranch, label: "Workflows", path: "/workflows" },
  { icon: Cpu, label: "Models", path: "/models" },
  { icon: Layers, label: "Skills", path: "/skills" },
  { icon: Globe, label: "Realms", path: "/realms" },
  { icon: Network, label: "Graph", path: "/graph" },
];

export function RecentRunsPanel({
  runs,
}: {
  runs: WorkflowRunWithName[];
}) {
  const router = useRouter();

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold text-foreground-400 uppercase tracking-widest px-0.5">
        Recent Runs
      </h2>

      <div className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-foreground-400" />
            <span className="text-sm font-semibold text-foreground">
              Workflow Runs
            </span>
          </div>
          <button
            onClick={() => router.push("/workflows")}
            className="text-xs text-primary-600 hover:underline"
          >
            View all
          </button>
        </div>

        {runs.length === 0 ? (
          <div className="px-4 py-8 flex flex-col items-center gap-2 text-center">
            <Layers className="w-6 h-6 text-foreground-200" />
            <p className="text-xs text-foreground-400">No workflow runs yet</p>
            <button
              onClick={() => router.push("/workflows")}
              className="text-xs text-primary-600 hover:underline mt-1"
            >
              Start your first workflow →
            </button>
          </div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {runs.map((run) => (
              <button
                key={run.id}
                onClick={() => router.push(`/workflows/runs/${run.id}`)}
                className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-background-200 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground font-medium truncate leading-tight">
                    {run.workflowName ?? run.workflowId}
                  </p>
                  <p className="text-[10px] text-foreground-400 mt-0.5">
                    {timeAgo(run.startedAt.toString())}
                  </p>
                </div>
                <RunStatusBadge status={run.status} />
                <ChevronRight className="w-3 h-3 text-foreground-300 group-hover:text-primary-500 shrink-0 transition-colors" />
              </button>
            ))}
          </div>
        )}
      </div>

      <h2 className="text-xs font-semibold text-foreground-400 uppercase tracking-widest px-0.5 pt-2">
        Explore
      </h2>
      <div className="grid grid-cols-2 gap-2">
        {EXPLORE_LINKS.map(({ icon: Icon, label, path }) => (
          <button
            key={path}
            onClick={() => router.push(path)}
            className="flex items-center gap-2 px-3 py-2.5 bg-background-100 border border-neutral-200 rounded-lg hover:border-primary-300 hover:bg-background-200 transition-all duration-200 group text-left"
          >
            <Icon className="w-4 h-4 text-foreground-400 group-hover:text-primary-500 transition-colors shrink-0" />
            <span className="text-sm text-foreground-600 group-hover:text-foreground font-medium transition-colors">
              {label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
