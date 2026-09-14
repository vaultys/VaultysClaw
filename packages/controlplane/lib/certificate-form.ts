import type { ResourceLimits } from "@vaultysclaw/policy";

/**
 * Parsing for the certificate issuance form.
 *
 * Separate from the Server Action that calls it because an action is a
 * `"use server"` module — it cannot be imported by a test, and this is the half
 * with the interesting failure modes.
 */
/**
 * Read the resource-limit fields off the issuance form.
 *
 * Returns null when the admin filled in neither, so a certificate issued the way
 * every certificate was issued before these fields existed is byte-identical to
 * one issued now — an empty form must not start writing an empty object into the
 * signed grant.
 */
export function parseResourceLimits(formData: FormData): ResourceLimits | null {
  const allowedDomains = splitDomains((formData.get("allowedDomains") as string) ?? "");
  const srt = parseSrtSettings((formData.get("srt") as string) ?? "");

  if (allowedDomains.length === 0 && srt === null) return null;
  return {
    ...(allowedDomains.length > 0 ? { allowedDomains } : {}),
    ...(srt !== null ? { srt } : {}),
  };
}

/** Accepts either commas or newlines, because both are what people paste. */
export function splitDomains(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((d) => d.trim())
    .filter((d) => d.length > 0);
}

/**
 * Parse the srt block, checking only that it is a JSON object.
 *
 * Deliberately not validated against srt's schema: that schema belongs to srt,
 * which validates it at launch and refuses to run on a bad one. Re-implementing
 * it here would mean a second definition to keep in step with a third-party
 * research preview, and the failure mode of a stale copy is the worst available
 * — rejecting a setting an admin legitimately wants, or worse, accepting one
 * this console understands and the holder does not.
 *
 * What is checked is what this layer can know: that the text parses, and that it
 * is an object rather than an array or a bare literal. Malformed input is
 * refused outright rather than dropped, because a certificate that silently
 * carries no confinement while its issuer believes it does is the failure this
 * whole subsystem exists to prevent.
 */
export function parseSrtSettings(raw: string): Record<string, unknown> | null {
  const text = raw.trim();
  if (text === "") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `The srt settings are not valid JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The srt settings must be a JSON object, e.g. { \"filesystem\": { … } }");
  }
  return parsed as Record<string, unknown>;
}
