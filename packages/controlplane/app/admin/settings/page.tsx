import { ServerIdentityDAO, SettingsDAO } from "@/db";
import PageChrome from "@/components/layout/PageChrome";
import { updateGeneralSettingsAction, updateTrustPolicyAction } from "./actions";
import {
  DEFAULT_ORG_NAME,
  DEFAULT_STAPLE_TTL_SECONDS,
  DEFAULT_TRUST_FAIL_MODE,
  SETTINGS_KEYS,
} from "@/lib/org-settings";

/**
 * Settings (docs/PAGE_DESIGN.md §1.9). Server identity is fully real — it's
 * a plain read of the same VaultysId every certificate is already signed
 * with.
 *
 * Trust policy is now genuinely enforced, not merely persisted. Both settings
 * reach connected Actors through `lib/actor-config.ts` (`trust.failMode` →
 * `failClosed`; `trust.stapleTtlSeconds` → `maxStatusAgeSeconds` for every kind
 * except `proxy`, which carries its own — see that file for why the two differ),
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
  const [serverVid, orgName, failMode, stapleTtlSeconds] = await Promise.all([
    ServerIdentityDAO.getServerVaultysId(),
    SettingsDAO.get(SETTINGS_KEYS.orgName),
    SettingsDAO.get(SETTINGS_KEYS.trustFailMode),
    SettingsDAO.get(SETTINGS_KEYS.trustStapleTtlSeconds),
  ]);

  const serverPublicKey = Buffer.from(serverVid.id).toString("base64");

  return (
    <div className="p-6 max-w-2xl space-y-8">
      <PageChrome toolbar={{ title: "Settings" }} breadcrumbs={[{ label: "Settings" }]} />

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
          Org-wide defaults for what a verifier does when it can't reach the control plane
          (docs/CERTIFICATE_WEB_OF_TRUST.md §5) — a per-workspace override column doesn't exist yet,
          so this is the only knob today.{" "}
          <strong className="text-warning-600 font-medium">
            Not yet enforced anywhere in this build
          </strong>{" "}
          — persisted here for when a verifier actually consumes it.
        </p>
        <form
          action={updateTrustPolicyAction}
          className="border border-neutral-200/60 rounded-xl bg-background-100 p-4 space-y-4 max-w-md"
        >
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Fail mode
            </label>
            <select
              name="failMode"
              defaultValue={failMode ?? DEFAULT_TRUST_FAIL_MODE}
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
            >
              <option value="closed">Closed — refuse to act until a live check succeeds</option>
              <option value="open">Open — proceed on last-known-good status, else warn and continue</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Staple TTL (seconds)
            </label>
            <input
              type="number"
              name="stapleTtlSeconds"
              min={0}
              defaultValue={stapleTtlSeconds ?? String(DEFAULT_STAPLE_TTL_SECONDS)}
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
            />
            <p className="text-xs text-foreground-400 mt-1">
              0 forces a live query every time. A positive value lets a verifier accept a signed
              status response presented within that window instead.
            </p>
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Save trust policy
          </button>
        </form>
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
