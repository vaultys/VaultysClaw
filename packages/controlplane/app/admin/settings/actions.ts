"use server";

import { revalidatePath } from "next/cache";
import { SettingsDAO } from "@/db";
import { SETTINGS_KEYS } from "@/lib/org-settings";
import { validateP2PConnectWindowSeconds } from "@/lib/login-window";
import { requireAdmin } from "@/lib/require-admin";
import { invalidateTrustPolicyCache } from "@/lib/trust-policy";
import { getWSServerInstance } from "@/lib/ws-server";

export async function updateGeneralSettingsAction(formData: FormData): Promise<void> {
  // `requireAdmin`, not a session-presence test: a Server Action is dispatched
  // without re-running `app/admin/layout.tsx`, so its `admin_console_access` gate
  // does not cover this endpoint (see lib/require-admin.ts).
  await requireAdmin();

  const orgName = (formData.get("orgName") as string)?.trim();
  if (!orgName) throw new Error("Organization name is required");

  await SettingsDAO.set(SETTINGS_KEYS.orgName, orgName);
  // The org name is read into every /admin/* page via app/admin/layout.tsx.
  revalidatePath("/admin", "layout");
}

/**
 * The org-wide trust policy — the defaults every workspace inherits unless it sets
 * its own (`updateWorkspaceTrustPolicyAction`, docs/CERTIFICATE_WEB_OF_TRUST.md §5.3).
 *
 * There is no "inherit" option here: this is the top of the chain.
 */
export async function updateTrustPolicyAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const failMode = formData.get("failMode") as string;
  if (failMode !== "open" && failMode !== "closed") {
    throw new Error("Fail mode must be 'open' or 'closed'");
  }

  const stapleTtlRaw = formData.get("stapleTtlSeconds") as string;
  const stapleTtlSeconds = Number.parseInt(stapleTtlRaw, 10);
  if (!Number.isFinite(stapleTtlSeconds) || stapleTtlSeconds < 0) {
    throw new Error("Staple TTL must be a non-negative number of seconds");
  }

  await SettingsDAO.set(SETTINGS_KEYS.trustFailMode, failMode);
  await SettingsDAO.set(SETTINGS_KEYS.trustStapleTtlSeconds, String(stapleTtlSeconds));
  // Before the push, or the fan-out below would rebuild every payload from the
  // values that were just replaced.
  invalidateTrustPolicyCache();

  // `lib/protocol.ts` has always claimed `actor_config` is pushed "whenever the
  // org trust settings change", and until now nothing here did it: a fail-mode
  // change only reached an Actor on its next reconnect, which for a long-lived
  // agent may be never. Actors whose workspace overrides both fields will simply
  // receive the same payload again.
  void getWSServerInstance()?.pushActorConfigToAll();

  revalidatePath("/admin/settings");
}

/**
 * How long a QR sign-in stays open (`lib/login-window.ts`).
 *
 * Its own action rather than a field on the General form: this one is read on the public login
 * path and bounds a background handshake, so it is worth being able to change without touching
 * anything the sidebar renders — and worth failing loudly on a bad value instead of quietly
 * clamping, which is what the validating parser is for.
 *
 * Nothing needs invalidating or pushing. The value is read per request by the two `p2p-connect`
 * routes, so the next person to open the login page gets the new window; sessions already waiting
 * keep the window they were promised, which is the right way round.
 */
export async function updateSignInSettingsAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const seconds = validateP2PConnectWindowSeconds(
    (formData.get("p2pConnectWindowSeconds") as string) ?? ""
  );
  await SettingsDAO.set(SETTINGS_KEYS.p2pConnectWindowSeconds, String(seconds));

  revalidatePath("/admin/settings");
}
