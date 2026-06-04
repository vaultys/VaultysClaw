/**
 * Skill loader — discovers and loads skill modules from a directory.
 *
 * A skill file must export either:
 *   export const skill: SkillDefinition = { ... }
 *   export default { skill: ... }
 *
 * Skills are loaded with dynamic `import()`. Only `.js` and `.mjs` files are
 * loaded (TypeScript must be pre-compiled; in dev, use tsx/bun).
 *
 * Hot-reload: when `watch: true`, the loader watches the directory with
 * fs.watch and reloads skills when files change.
 */

import fs from "fs";
import path from "path";
import pino from "pino";
import type { SkillDefinition } from "./types";
import { createSkillRegistry, type SkillRegistry } from "./registry";

const logger = pino({ name: "skill-loader" });

export interface SkillLoaderOptions {
  /** Directory to scan for skill files/directories. */
  skillsDir: string;
  /** Watch for changes and hot-reload. Default false. */
  watch?: boolean;
  /** Called whenever skills are (re)loaded. */
  onReload?: (registry: SkillRegistry) => void;
}

export class SkillLoader {
  private readonly opts: SkillLoaderOptions;
  private watcher: fs.FSWatcher | null = null;
  private reloadDebounce: ReturnType<typeof setTimeout> | null = null;

  /** Last loaded skill registry — available after `load()` completes. */
  lastRegistry: SkillRegistry = createSkillRegistry([]);

  constructor(opts: SkillLoaderOptions) {
    this.opts = opts;
  }

  /** Load all skills from the configured directory. */
  async load(): Promise<SkillRegistry> {
    const { skillsDir } = this.opts;

    if (!fs.existsSync(skillsDir)) {
      logger.info(
        { skillsDir },
        "Skills directory does not exist — no skills loaded"
      );
      this.lastRegistry = createSkillRegistry([]);
      return this.lastRegistry;
    }

    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    const skills: SkillDefinition[] = [];

    for (const entry of entries) {
      const fullPath = path.join(skillsDir, entry.name);
      let skillDef: SkillDefinition | null = null;

      try {
        if (
          entry.isFile() &&
          (entry.name.endsWith(".js") || entry.name.endsWith(".mjs"))
        ) {
          skillDef = await loadSkillFromFile(fullPath);
        } else if (entry.isDirectory()) {
          // Look for index.js/index.mjs in the directory
          for (const idx of ["index.js", "index.mjs"]) {
            const idxPath = path.join(fullPath, idx);
            if (fs.existsSync(idxPath)) {
              skillDef = await loadSkillFromFile(idxPath);
              break;
            }
          }
        }

        if (skillDef) {
          skills.push(skillDef);
          logger.info(
            { name: skillDef.name, version: skillDef.version },
            "Skill loaded"
          );
        }
      } catch (err) {
        logger.error(
          { path: fullPath, err },
          "Failed to load skill — skipping"
        );
      }
    }

    logger.info({ count: skills.length, skillsDir }, "Skill loading complete");
    this.lastRegistry = createSkillRegistry(skills);
    return this.lastRegistry;
  }

  /** Start watching the skills directory for changes. */
  startWatch(onReload: (registry: SkillRegistry) => void): void {
    const { skillsDir } = this.opts;
    if (!fs.existsSync(skillsDir)) return;

    this.watcher = fs.watch(skillsDir, { recursive: true }, () => {
      if (this.reloadDebounce) clearTimeout(this.reloadDebounce);
      this.reloadDebounce = setTimeout(async () => {
        logger.info({ skillsDir }, "Skills directory changed — reloading");
        const registry = await this.load();
        onReload(registry);
      }, 500);
    });

    logger.info({ skillsDir }, "Watching skills directory for changes");
  }

  /** Stop watching. */
  stopWatch(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.reloadDebounce) {
      clearTimeout(this.reloadDebounce);
      this.reloadDebounce = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function loadSkillFromFile(
  filePath: string
): Promise<SkillDefinition | null> {
  // Clear require cache to support hot-reload
  try {
    const mod = await import(`${filePath}?t=${Date.now()}`);
    const skillDef: SkillDefinition | undefined =
      mod.skill ?? // named export: export const skill = ...
      mod.default?.skill; // default export: export default { skill: ... }

    if (!skillDef) {
      logger.warn({ filePath }, "Skill file has no 'skill' export — skipping");
      return null;
    }

    if (!isValidSkill(skillDef)) {
      logger.warn({ filePath, skillDef }, "Skill export is invalid — skipping");
      return null;
    }

    return skillDef;
  } catch (err) {
    throw new Error(`Failed to import ${filePath}: ${String(err)}`);
  }
}

function isValidSkill(s: unknown): s is SkillDefinition {
  if (typeof s !== "object" || s === null) return false;
  const d = s as Record<string, unknown>;
  return (
    typeof d.name === "string" &&
    d.name.length > 0 &&
    typeof d.description === "string" &&
    typeof d.version === "string" &&
    Array.isArray(d.tools)
  );
}
