/**
 * Whether the browser-software-identity login path ("connect without the app") is available.
 *
 * That path lets a browser generate a VaultysId in JavaScript and register/log in with it over
 * plain HTTP, instead of pairing with a real wallet. It exists so this can be developed and demoed
 * without a physical wallet — and it is emphatically **not** something a real deployment should
 * expose, because a software identity minted in the visitor's own browser is not evidence of
 * anything.
 *
 * It used to be gated only in the UI (`NODE_ENV !== "production"` hiding a link) while
 * `GET /api/public/user/connect` stayed reachable in every environment. That is not a gate: on a
 * deployment with no human Actor yet, that route hands an anonymous caller a *registration*
 * certificate, and the bootstrap flow then grants the first human `admin_console_access`. Whoever
 * found the endpoint first became the administrator.
 *
 * So the check lives here, one implementation, applied at the route as well as in the UI.
 *
 * `NEXT_PUBLIC_ALLOW_DEV_LOGIN=1` is the explicit opt-in, used by the fleet-simulator demo stack
 * (`docker/simulator.env`), which runs a production build but has no wallet and no admin. It is
 * `NEXT_PUBLIC_` deliberately: the client half is inlined at build time, so a build made without it
 * cannot have the link, and enabling it later would require rebuilding — it is not something an
 * environment variable can switch on against a shipped production image by accident.
 */
export function isDevLoginEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN === "1") return true;
  return process.env.NODE_ENV !== "production";
}
