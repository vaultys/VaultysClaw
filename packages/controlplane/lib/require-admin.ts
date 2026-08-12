/**
 * The authorization gate for **Server Actions**, as opposed to page loads.
 *
 * `app/admin/layout.tsx` checks `admin_console_access` before rendering any
 * admin route, which is what makes the console itself safe to navigate. It does
 * *not* protect a Server Action: an action is a POST to its own generated
 * endpoint, dispatched by the Next.js runtime without re-running the layout of
 * the route it happens to be defined under. So a merely-authenticated
 * session — a `portal_access`-only human, say — can invoke an admin action
 * directly unless the action checks for itself.
 *
 * Every mutating admin action should therefore start with `await requireAdmin()`
 * rather than the weaker `session?.user?.did` presence test. It returns the
 * `performedBy` shape `lib/audit.ts` wants, so the check and the audit
 * attribution come from the same call instead of two.
 */
import { getServerSession } from "next-auth";
import { authOptions } from "./auth-config";
import { hasCapability } from "./access-control";
import type { PerformedBy } from "./webhook-payloads";

export async function requireAdmin(): Promise<PerformedBy> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) throw new Error("Not authenticated");

  const authorized = await hasCapability(session.user.did, "admin_console_access");
  if (!authorized) {
    // Deliberately the same wording the layout's denial uses — an action invoked
    // out of band shouldn't reveal more about why it was refused than the page would.
    throw new Error("Not authorized: admin_console_access required");
  }

  return { did: session.user.did, name: session.user.name ?? "Unnamed" };
}
