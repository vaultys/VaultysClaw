"use client";

import { ChevronRight, Zap, ToggleLeft, ToggleRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { SkillConfig } from "@vaultysclaw/shared";

interface SkillsStepProps {
  skills: SkillConfig[];
  savingSkills: boolean;
  onToggleSkill: (skill: SkillConfig, realmSkillId: string) => void;
  onContinue: () => void;
}

export function SkillsStep({
  skills,
  savingSkills,
  onToggleSkill,
  onContinue,
}: SkillsStepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1">
          Configure skills
        </h2>
        <p className="text-sm text-foreground-500">
          Skills are realm-level capabilities injected into the agent. Required
          skills cannot be disabled.
        </p>
      </div>

      {skills.length === 0 ? (
        <div className="bg-background-100 border border-neutral-200 rounded-xl p-6 text-center text-sm text-foreground-500">
          <Zap size={20} className="mx-auto mb-2 text-foreground-400" />
          No skills configured for this realm yet.
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
                  <span className="text-[10px] bg-warning-100 dark:bg-warning-500/15 text-warning-700 dark:text-warning-400 border border-warning-300 dark:border-warning-500/30 px-1.5 py-0.5 rounded font-medium">
                    Required
                  </span>
                )}
              </div>
              <button
                disabled={skill.isRequired || savingSkills}
                onClick={() => onToggleSkill(skill, skill.name)}
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
