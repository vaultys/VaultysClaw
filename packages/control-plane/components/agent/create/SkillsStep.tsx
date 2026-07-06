"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Zap, ToggleLeft, ToggleRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { SkillConfig } from "@vaultysclaw/shared";
import { agentsClient, unwrap } from "@/lib/api/ts-rest/client";

interface SkillsStepProps {
  agentDid: string | null;
  onContinue: () => void;
}

export function SkillsStep({ agentDid, onContinue }: SkillsStepProps) {
  const [skills, setSkills] = useState<SkillConfig[]>([]);
  const [savingSkills, setSavingSkills] = useState(false);

  // Load this agent's workspace skills on mount
  useEffect(() => {
    if (!agentDid) return;
    agentsClient
      .getSkills({ params: { did: agentDid } })
      .then(unwrap)
      .then((d) => setSkills((d.skills as SkillConfig[] | undefined) ?? []))
      .catch(() => {});
  }, [agentDid]);

  async function toggleSkill(skill: SkillConfig, workspaceSkillId: string) {
    if (!agentDid || skill.isRequired) return;
    const newEnabled = !skill.enabled;
    setSkills((prev) =>
      prev.map((s) =>
        s.name === skill.name ? { ...s, enabled: newEnabled } : s
      )
    );
    setSavingSkills(true);
    try {
      unwrap(
        await agentsClient.updateSkillOverride({
          params: { did: agentDid },
          body: { workspaceSkillId, enabled: newEnabled },
        })
      );
    } finally {
      setSavingSkills(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1">
          Configure skills
        </h2>
        <p className="text-sm text-foreground-500">
          Skills are workspace-level capabilities injected into the agent. Required
          skills cannot be disabled.
        </p>
      </div>

      {skills.length === 0 ? (
        <div className="bg-background-100 border border-neutral-200 rounded-xl p-6 text-center text-sm text-foreground-500">
          <Zap size={20} className="mx-auto mb-2 text-foreground-400" />
          No skills configured for this workspace yet.
        </div>
      ) : (
        <div className="bg-background-100 border border-neutral-200 rounded-xl divide-y divide-neutral-200 overflow-hidden">
          {skills.map((skill) => (
            <div
              key={skill.name}
              className="flex items-center justify-between px-4 py-3"
            >
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">
                  {skill.name}
                </p>
                {skill.isRequired && (
                  <span className="text-[10px] bg-warning-100 text-warning-700 border border-warning-300 px-1.5 py-0.5 rounded font-medium">
                    Required
                  </span>
                )}
              </div>
              <button
                disabled={skill.isRequired || savingSkills}
                onClick={() => toggleSkill(skill, skill.name)}
                className={cn(
                  "transition-colors",
                  skill.isRequired
                    ? "opacity-40 cursor-not-allowed"
                    : "hover:opacity-80",
                  skill.enabled ? "text-primary-500" : "text-neutral-200"
                )}
                title={
                  skill.isRequired
                    ? "Cannot disable required skill"
                    : skill.enabled
                      ? "Disable"
                      : "Enable"
                }
              >
                {skill.enabled ? (
                  <ToggleRight size={28} />
                ) : (
                  <ToggleLeft size={28} />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          onClick={onContinue}
          className="text-sm text-foreground-500 hover:text-foreground transition-colors"
        >
          Skip for now
        </button>
        <button
          onClick={onContinue}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Continue <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
