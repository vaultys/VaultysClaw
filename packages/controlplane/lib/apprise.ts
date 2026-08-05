/**
 * Admin-CRUD-time calls to the self-hosted Apprise API container
 * (docs/REBUILD_ARCHITECTURE.md §5.3) — pushing/removing a channel's service
 * URLs into Apprise's own store. Delivery-time (`/notify/<key>`) lives in
 * `packages/webhook-dispatcher/src/apprise.ts` instead: that call never needs
 * the decrypted service URLs (Apprise already has them from `/add`), only
 * `appriseKey`, which is why it doesn't need this package's vault access.
 *
 * Note: the actual `caronc/apprise` image only accepts POST on `/del`
 * (confirmed empirically — a bare DELETE returns 405), despite
 * docs/REBUILD_ARCHITECTURE.md describing it as `DELETE`. All three calls
 * here use POST to match the real API, not the doc's assumption.
 */

function appriseApiUrl(): string | null {
  const url = process.env.APPRISE_API_URL;
  return url ? url.replace(/\/+$/, "") : null;
}

function splitServiceUrls(serviceUrls: string): string[] {
  return serviceUrls
    .split("\n")
    .map((u) => u.trim())
    .filter(Boolean);
}

/**
 * The URL scheme(s) only (e.g. "slack", "mailto") — the one piece of a service URL that isn't
 * sensitive and is actually useful to show an admin, since the rest of the URL (tokens,
 * credentials) is encrypted and never redisplayed. Call this on the plaintext value *before*
 * encrypting it (`NotificationChannel.serviceTypes` stores the result in plain).
 */
export function extractServiceTypes(serviceUrls: string): string[] {
  const schemes = splitServiceUrls(serviceUrls)
    .map((u) => /^([a-zA-Z0-9+.-]+):\/\//.exec(u)?.[1]?.toLowerCase())
    .filter((s): s is string => !!s);
  return [...new Set(schemes)];
}

/** Friendly labels for Apprise's more common schemes — anything else falls back to the raw
 *  scheme, capitalized, which is still meaningful (e.g. "Ntfy", "Pushover"). Not an exhaustive
 *  list of Apprise's several hundred supported services by design. */
const SERVICE_TYPE_LABELS: Record<string, string> = {
  mailto: "Email",
  mailtos: "Email",
  slack: "Slack",
  discord: "Discord",
  pagerduty: "PagerDuty",
  telegram: "Telegram",
  msteams: "Microsoft Teams",
  json: "JSON webhook",
  jsons: "JSON webhook",
  xml: "XML webhook",
  form: "Form webhook",
  sns: "AWS SNS",
  twilio: "Twilio",
  webexteams: "Webex",
  matrix: "Matrix",
  gotify: "Gotify",
  ntfy: "ntfy",
  pushover: "Pushover",
  pushbullet: "Pushbullet",
};

export function serviceTypeLabel(scheme: string): string {
  return SERVICE_TYPE_LABELS[scheme.toLowerCase()] ?? scheme.charAt(0).toUpperCase() + scheme.slice(1);
}

/**
 * Pushes (or replaces) a channel's service URLs into Apprise under `appriseKey`.
 * Throws on failure or if APPRISE_API_URL isn't configured — unlike webhook
 * delivery, this runs synchronously in an admin Server Action, so the admin
 * should see immediately if the channel isn't actually usable, not find out
 * silently at the next notification attempt.
 */
export async function pushAppriseConfig(appriseKey: string, serviceUrls: string): Promise<void> {
  const base = appriseApiUrl();
  if (!base) throw new Error("APPRISE_API_URL is not configured");

  const urls = splitServiceUrls(serviceUrls);
  if (urls.length === 0) throw new Error("At least one service URL is required");

  const res = await fetch(`${base}/add/${encodeURIComponent(appriseKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ urls: urls.join(",") }),
  });
  if (!res.ok) {
    throw new Error(`Apprise /add failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json().catch(() => null)) as { error?: string | null } | null;
  if (data?.error) throw new Error(`Apprise /add failed: ${data.error}`);
}

/** Removes a channel's config from Apprise. Best-effort from the caller's perspective is wrong
 *  here too — if this fails, the admin needs to know the channel wasn't actually cleaned up. */
export async function deleteAppriseConfig(appriseKey: string): Promise<void> {
  const base = appriseApiUrl();
  if (!base) throw new Error("APPRISE_API_URL is not configured");

  const res = await fetch(`${base}/del/${encodeURIComponent(appriseKey)}`, { method: "POST" });
  if (!res.ok) {
    throw new Error(`Apprise /del failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
}
