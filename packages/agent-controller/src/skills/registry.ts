/**
 * Skill registry implementation.
 *
 * Merges tools from all loaded skills and provides system prompt extensions.
 */

import type { AgentToolDefinition } from "../tools/types";
import type { SkillDefinition, SkillRegistry } from "./types";

export { type SkillDefinition, type SkillRegistry } from "./types";

// ---------------------------------------------------------------------------
// Registry implementation
// ---------------------------------------------------------------------------

class SkillRegistryImpl implements SkillRegistry {
  private readonly _skills: SkillDefinition[];
  private readonly byName: Map<string, SkillDefinition>;

  constructor(skills: SkillDefinition[]) {
    this._skills = skills;
    this.byName = new Map(skills.map((s) => [s.name, s]));
  }

  get skills(): ReadonlyArray<SkillDefinition> {
    return this._skills;
  }

  get(name: string): SkillDefinition | undefined {
    return this.byName.get(name);
  }

  getAllTools(): AgentToolDefinition[] {
    return this._skills.flatMap((s) => s.tools);
  }

  getSystemPromptExtensions(): string[] {
    return this._skills
      .map((s) => s.systemPromptExtension)
      .filter((ext): ext is string => !!ext);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSkillRegistry(skills: SkillDefinition[]): SkillRegistry {
  return new SkillRegistryImpl(skills);
}
