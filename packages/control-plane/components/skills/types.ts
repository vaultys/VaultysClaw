import type { RealmSkillWithMeta } from "@/lib/contracts";

/** A realm picked down to what the skill modals need. */
export type RealmOption = { id: string; name: string };

/** All registrations of a single skill name, across the realms it lives in. */
export type SkillGroup = { name: string; entries: RealmSkillWithMeta[] };

/** Group flat skill rows by their skill name. */
export function groupByName(rows: RealmSkillWithMeta[]): SkillGroup[] {
  const map = new Map<string, RealmSkillWithMeta[]>();
  for (const row of rows) {
    const list = map.get(row.name) ?? [];
    list.push(row);
    map.set(row.name, list);
  }
  return Array.from(map.entries()).map(([name, entries]) => ({
    name,
    entries,
  }));
}

/** Stringify a skill `config` JSON value for editing/preview, falling back to `{}`. */
export function configToText(config: RealmSkillWithMeta["config"]): string {
  try {
    if (!config) return "{}";
    if (typeof config === "string")
      return JSON.stringify(JSON.parse(config), null, 2);
    return JSON.stringify(config, null, 2);
  } catch {
    return typeof config === "string" ? config : "{}";
  }
}
