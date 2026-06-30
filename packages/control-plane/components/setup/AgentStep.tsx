"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot } from "lucide-react";
import { agentsClient, unwrap } from "@/lib/api/ts-rest/client";
import type { AgentInfo } from "@/lib/contracts";
import { StepFooter } from "./ui";

const ONBOARDING_STEPS = [
  {
    icon: "🔗",
    title: "Install SDK",
    desc: "Add the VaultysClaw agent package to your project.",
  },
  {
    icon: "🔑",
    title: "Register",
    desc: "Agent presents its VaultysID — you approve it here.",
  },
  {
    icon: "🎛️",
    title: "Assign caps",
    desc: "Control what tools and resources each agent can use.",
  },
];

export function AgentStep({ onNext }: { onNext: () => void }) {
  const router = useRouter();
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    agentsClient
      .search({ query: { pageSize: 20 } })
      .then((r) => unwrap(r))
      .then((page) => setAgents(page.items ?? []))
      .catch(() => {})
      .finally(() => setFetching(false));
  }, []);

  return (
    <div className="space-y-5">
      <p className="text-foreground-500 text-sm leading-relaxed">
        Register your first AI agent. Agents connect via WebSocket and receive
        tasks cryptographically signed by the control plane.
      </p>

      {fetching ? (
        <div className="flex items-center justify-center py-6">
          <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : agents.length > 0 ? (
        <div className="space-y-2">
          {agents.map((a) => (
            <div
              key={a.did}
              className="flex items-center gap-3 px-4 py-3 bg-background-200 border border-neutral-200 rounded-xl"
            >
              <div className="w-8 h-8 rounded-lg bg-background-100 border border-neutral-200 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-foreground-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {a.name}
                </p>
                {a.capabilities.length > 0 && (
                  <p className="text-xs text-foreground-400 truncate">
                    {a.capabilities.slice(0, 3).join(", ")}
                    {a.capabilities.length > 3
                      ? ` +${a.capabilities.length - 3}`
                      : ""}
                  </p>
                )}
              </div>
              <span
                className={`flex items-center gap-1 text-xs font-medium shrink-0 ${
                  a.online ? "text-success-600" : "text-foreground-400"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${a.online ? "bg-success-500" : "bg-neutral-200"}`}
                />
                {a.online ? "Online" : "Offline"}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {ONBOARDING_STEPS.map(({ icon, title, desc }) => (
            <div
              key={title}
              className="bg-background-200 border border-neutral-200 rounded-xl p-3 text-center"
            >
              <div className="text-2xl mb-2">{icon}</div>
              <p className="text-xs font-semibold text-foreground mb-1">
                {title}
              </p>
              <p className="text-xs text-foreground-500 leading-snug">{desc}</p>
            </div>
          ))}
        </div>
      )}

      <StepFooter>
        {agents.length === 0 ? (
          <button
            onClick={() => {
              onNext();
              router.push("/agents/create");
            }}
            className="flex items-center gap-2 px-5 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-xl transition-colors"
          >
            <Bot className="w-4 h-4" /> Create first agent
          </button>
        ) : (
          <button
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
