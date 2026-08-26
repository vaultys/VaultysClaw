/**
 * The capability manifest — how a host application declares which capability names it needs and
 * which of its own operations each one gates (docs/CUSTOM_CAPABILITIES.md Phase 4).
 *
 * The SDK deliberately has **no tool registry**. What an operation *is* — a tool, an HTTP route, a
 * button — is the application's business, and a capability's meaning was always the application's
 * business too. What the SDK owns is the seam: it knows which capability gates which operation
 * name, it can answer "may I do this", and it reports the declared set to the control plane so an
 * admin can see what an Actor wants without the Actor being able to grant itself anything.
 *
 * ```jsonc
 * {
 *   "version": 1,
 *   "declares": [
 *     { "name": "acme:invoice.approve", "label": "Approve invoices",
 *       "description": "Marks an invoice approved in the Acme ERP." }
 *   ],
 *   "bindings": { "erp_approve_invoice": "acme:invoice.approve" }
 * }
 * ```
 *
 * Keeping bindings in a file rather than in code is what lets an operator re-point an operation at
 * a different capability — or at a built-in — without a rebuild.
 */

import fs from "node:fs";
import { assertValidCapabilityName } from "@vaultysclaw/policy";
import { expandHome } from "./identity.js";

/** One capability the application declares it needs. */
export interface DeclaredCapability {
  /** A built-in name, or a custom `vendor:action`. */
  name: string;
  /** Human-readable name for the admin deciding whether to grant it. */
  label?: string;
  /** What holding it actually lets this application do. */
  description?: string;
}

export interface CapabilityManifest {
  version: 1;
  declares: DeclaredCapability[];
  /** operation name → capability name. */
  bindings: Record<string, string>;
}

/** The empty manifest — what a runtime configured without one behaves as. */
export const EMPTY_MANIFEST: CapabilityManifest = Object.freeze({
  version: 1,
  declares: [],
  bindings: {},
}) as CapabilityManifest;

/**
 * Parse and validate a manifest.
 *
 * Every error here is thrown rather than warned about, because each one describes an operation
 * that would otherwise be silently ungated or permanently denied — the two failure modes nobody
 * notices until it matters:
 *
 * - an invalid capability name (a typo that can never be granted)
 * - a binding naming a capability absent from `declares` (the admin is never asked for it)
 * - a duplicate declaration (two entries, one of which is dead)
 */
export function parseCapabilityManifest(raw: unknown, source = "manifest"): CapabilityManifest {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`${source}: expected a JSON object`);
  }
  const obj = raw as Record<string, unknown>;

  if (obj.version !== 1) {
    throw new Error(`${source}: unsupported version ${JSON.stringify(obj.version)} (expected 1)`);
  }

  const declaresRaw = obj.declares ?? [];
  if (!Array.isArray(declaresRaw)) throw new Error(`${source}: "declares" must be an array`);

  const declares: DeclaredCapability[] = [];
  const seen = new Set<string>();
  for (const entry of declaresRaw) {
    if (typeof entry !== "object" || entry === null) {
      throw new Error(`${source}: every "declares" entry must be an object`);
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.name !== "string") {
      throw new Error(`${source}: every "declares" entry needs a string "name"`);
    }
    assertValidCapabilityName(e.name);
    if (seen.has(e.name)) throw new Error(`${source}: "${e.name}" is declared more than once`);
    seen.add(e.name);
    declares.push({
      name: e.name,
      label: typeof e.label === "string" ? e.label : undefined,
      description: typeof e.description === "string" ? e.description : undefined,
    });
  }

  const bindingsRaw = obj.bindings ?? {};
  if (typeof bindingsRaw !== "object" || bindingsRaw === null || Array.isArray(bindingsRaw)) {
    throw new Error(`${source}: "bindings" must be an object`);
  }

  const bindings: Record<string, string> = {};
  for (const [operation, capability] of Object.entries(bindingsRaw as Record<string, unknown>)) {
    if (typeof capability !== "string") {
      throw new Error(`${source}: binding "${operation}" must name a capability as a string`);
    }
    assertValidCapabilityName(capability);
    if (!seen.has(capability)) {
      // Not a warning: an operation bound to an undeclared capability is one the control plane is
      // never asked to grant, so it can only ever be denied — silently, at the worst moment.
      throw new Error(
        `${source}: binding "${operation}" names "${capability}", which is not in "declares"`
      );
    }
    bindings[operation] = capability;
  }

  return { version: 1, declares, bindings };
}

/**
 * Load a manifest from disk.
 *
 * Returns {@link EMPTY_MANIFEST} when no path is configured. A configured path that does not exist
 * **is** an error, unlike the capability-state file: an application that meant to declare
 * capabilities and silently declared none would look identical to one that needed none.
 */
export function loadCapabilityManifest(manifestPath?: string): CapabilityManifest {
  if (!manifestPath) return EMPTY_MANIFEST;
  const resolved = expandHome(manifestPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Capability manifest not found at ${resolved}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(resolved, "utf-8"));
  } catch (err) {
    throw new Error(`Capability manifest at ${resolved} is not valid JSON: ${String(err)}`);
  }
  return parseCapabilityManifest(parsed, resolved);
}
