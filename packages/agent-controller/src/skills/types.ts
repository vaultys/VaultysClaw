/**
 * Skill system types for the agent controller.
 *
 * A skill bundles a set of related tools together with an optional
 * system-prompt extension. Skills can be built-in or loaded from
 * user-defined files at runtime.
 */

import type { AgentToolDefinition } from "../tools/types";

// ---------------------------------------------------------------------------
// Skill definition
// ---------------------------------------------------------------------------

export interface SkillDefinition {
  /** Unique skill identifier (e.g. "web-scraper"). Must be URL-safe. */
  name: string;
  /** Human-readable description shown in the agent dashboard. */
  description: string;
  /** Semantic version (e.g. "1.0.0"). */
  version: string;
  /** Tools contributed by this skill. */
  tools: AgentToolDefinition[];
  /**
   * Optional text appended to the system prompt when this skill is loaded.
   * Use this to give the LLM guidance on how to use the skill's tools.
   */
  systemPromptExtension?: string;
}

// ---------------------------------------------------------------------------
// Skill module (what a file must export as default or named "skill")
// ---------------------------------------------------------------------------

export interface SkillModule {
  skill: SkillDefinition;
}

// ---------------------------------------------------------------------------
// Skill registry
// ---------------------------------------------------------------------------

export interface SkillRegistry {
  /** All loaded skills. */
  readonly skills: ReadonlyArray<SkillDefinition>;
  /** Look up a skill by name. */
  get(name: string): SkillDefinition | undefined;
  /** All tools contributed by all loaded skills. */
  getAllTools(): AgentToolDefinition[];
  /** Collect system prompt extensions from all skills. */
  getSystemPromptExtensions(): string[];
}
