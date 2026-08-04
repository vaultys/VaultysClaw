import type { RenderedNotification } from "./render";

/**
 * Delivery-time call to the self-hosted Apprise API (docs/REBUILD_ARCHITECTURE.md §5.3). Unlike
 * the admin-CRUD-time `/add`/`/del` calls (which live in packages/controlplane's own
 * `lib/apprise.ts`, since only that process can decrypt a channel's service URLs), this only ever
 * needs the plain `appriseKey` — Apprise already has the URLs stored from `/add`.
 *
 * Note: mirrors the real `caronc/apprise` image's actual behavior (POST-only — a bare DELETE on
 * `/del` returns 405), confirmed empirically; not blindly following
 * docs/REBUILD_ARCHITECTURE.md's `DELETE` assumption, which doesn't apply here anyway since this
 * function never deletes.
 */
export async function notifyApprise(
  fetchImpl: typeof fetch,
  baseUrl: string,
  appriseKey: string,
  notification: RenderedNotification
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}/notify/${encodeURIComponent(appriseKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(notification),
    });
    if (!res.ok) {
      return { ok: false, error: `Apprise /notify responded ${res.status}` };
    }
    const data = (await res.json().catch(() => null)) as { error?: string | null } | null;
    if (data?.error) return { ok: false, error: data.error };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
