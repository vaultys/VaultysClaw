import { KillSwitchDAO, ServerIdentityDAO, SettingsDAO } from "@/db";
import PageChrome from "@/components/layout/PageChrome";
import KillSwitchPanel from "@/components/KillSwitchPanel";
import TrustPolicyForm from "@/components/TrustPolicyForm";
import { updateGeneralSettingsAction } from "./actions";
import { DEFAULT_ORG_NAME, SETTINGS_KEYS } from "@/lib/org-settings";
import { getOrgTrustDefaults } from "@/lib/trust-policy";

/**
 * Settings (docs/PAGE_DESIGN.md §1.9). Server identity is fully real — it's
 * a plain read of the same VaultysId every certificate is already signed
 * with.
 *
 * Trust policy is now genuinely enforced, not merely persisted. Both settings
 * reach connected Actors through `lib/actor-config.ts` (`trust.failMode` →
 * `failClosed`; `trust.stapleTtlSeconds` → `maxStatusAgeSeconds` for every kind
 * except the two enforcing ones, which carry their own — see that file for why they differ),
 * and `packages/sdk`'s `ActorRuntime` acts on them: it refreshes its certificate
 * status on that cadence, verifies the response with
 * `verifyCertStatusResponseCert(vid, token, maxAgeMs)`, and denies everything
 * once a staple ages out under fail-closed.
 *
 * Still true, and worth keeping loud: enforcement is **client-side**. These
 * settings govern how promptly a well-behaved Actor notices a revocation; they
 * are not a server-side gate on what a compromised one attempts.
 */
export default async function SettingsPage() {
  const [serverVid, orgName, orgTrust, killSwitch] = await Promise.all([
    ServerIdentityDAO.getServerVaultysId(),
    SettingsDAO.get(SETTINGS_KEYS.orgName),
    // Read through `lib/trust-policy.ts` rather than the raw `Setting` rows, so this
    // page shows exactly what an Actor would be pushed — parsing, defaults and all.
    getOrgTrustDefaults(),
    KillSwitchDAO.findGlobal(),
  ]);

  const serverPublicKey = Buffer.from(serverVid.id).toString("base64");

  return (
    <div className="p-6 max-w-2xl space-y-8">
      <PageChrome toolbar={{ title: "Settings" }} breadcrumbs={[{ label: "Settings" }]} />

      {/* First, not last: this is the control an admin comes here for during an
          incident, and hunting for it below three configuration sections is the
          wrong thing to be doing at that moment. */}
      <KillSwitchPanel
        scope="global"
        armed={
          killSwitch
            ? {
                reason: killSwitch.reason,
                armedBy: killSwitch.armedBy,
                armedAt: killSwitch.armedAt.toISOString(),
              }
            : null
        }
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground-700">Server identity</h2>
        <p className="text-xs text-foreground-400">
          This is the identity that signs every certificate and policy in your organization — the
          root of trust the whole ledger hangs off of (docs/CERTIFICATE_WEB_OF_TRUST.md §1).
        </p>
        <div className="border border-neutral-200/60 rounded-xl bg-background-100 p-4 space-y-3 text-sm">
          <div>
            <div className="text-xs text-foreground-500 uppercase font-medium mb-1">DID</div>
            <div className="font-mono text-xs break-all">{serverVid.did}</div>
          </div>
          <div>
            <div className="text-xs text-foreground-500 uppercase font-medium mb-1">
              Public key (base64)
            </div>
            <div className="font-mono text-xs break-all text-foreground-500">{serverPublicKey}</div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground-700">Trust policy</h2>
        <p className="text-xs text-foreground-400">
          What a verifier does when it can&apos;t reach the control plane
          (docs/CERTIFICATE_WEB_OF_TRUST.md §5). These are the organization-wide{" "}
          <strong className="font-medium text-foreground-600">defaults</strong>: a workspace can
          override either field on its own Settings tab, and inherits the one it doesn&apos;t.
          Enforcement is <strong className="font-medium text-foreground-600">client-side</strong> —
          these settings govern how promptly a well-behaved Actor notices a revocation, not what a
          compromised one can attempt.
        </p>
        <TrustPolicyForm
          scope="global"
          value={{ failMode: orgTrust.failMode, stapleTtlSeconds: orgTrust.stapleTtlSeconds }}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground-700">General</h2>
        <form
          action={updateGeneralSettingsAction}
          className="border border-neutral-200/60 rounded-xl bg-background-100 p-4 space-y-4 max-w-md"
        >
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Organization name
            </label>
            <input
              type="text"
              name="orgName"
              defaultValue={orgName ?? DEFAULT_ORG_NAME}
              required
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
            />
            <p className="text-xs text-foreground-400 mt-1">Shown in the sidebar.</p>
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Save
          </button>
        </form>
      </section>
    </div>
  );
}
