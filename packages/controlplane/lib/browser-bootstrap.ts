/**
 * What is still dev-only about browser-held VaultysIds, now that the rest of that
 * path is a production feature.
 *
 * A browser can generate a VaultysId in JavaScript and run the real Challenger
 * handshake with it over plain HTTP (`lib/browser-connect.ts`). Two very
 * different things used to hide behind one flag:
 *
 *  1. **Logging in as an identity this browser already holds.** That is a login
 *     attempt like any other — `loginHuman` rejects a DID that is not a
 *     registered Actor, so possession of the key is the whole authorization
 *     story. Safe everywhere, and now the credential an SSO-registered human
 *     actually holds (see `lib/sso.ts`).
 *  2. **Minting a brand-new identity for an anonymous caller.** On a deployment
 *     with no human Actor yet, `GET /api/public/user/connect` hands that caller a
 *     *registration* certificate and the bootstrap flow grants the first human
 *     `admin_console_access` — whoever found the endpoint first became the
 *     administrator. A software identity minted in a visitor's own browser is not
 *     evidence of anything, so this half must stay shut in a real deployment.
 *
 * Only (2) is gated. Redeeming an **invitation** with a fresh browser identity is
 * ungated too, and deliberately: those routes require an unguessable single-use
 * token an admin (or a verified SSO login) issued, which is the authorization the
 * bootstrap route is missing.
 *
 * `NEXT_PUBLIC_ALLOW_DEV_LOGIN=1` is the explicit opt-in, used by the
 * fleet-simulator demo stack (`docker/simulator.env`), which runs a production
 * build but has no wallet and no admin. It is `NEXT_PUBLIC_` deliberately: the
 * client half is inlined at build time, so a build made without it cannot offer
 * the path, and enabling it later would require rebuilding — it is not something
 * an environment variable can switch on against a shipped production image by
 * accident.
 */
export function isBrowserBootstrapEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN === "1") return true;
  return process.env.NODE_ENV !== "production";
}
