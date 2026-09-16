"use server";

import { revalidatePath } from "next/cache";
import { SettingsDAO } from "@/db";
import { SETTINGS_KEYS } from "@/lib/org-settings";
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
