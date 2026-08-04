import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-config";
import { hasCapability } from "@/lib/access-control";
import AppShell from "@/components/layout/AppShell";
import { SettingsDAO } from "@/db";
import { DEFAULT_ORG_NAME, SETTINGS_KEYS } from "@/lib/org-settings";

/**
 * The admin console's capability gate (docs/PAGE_DESIGN.md §0): a route
 * loads only if the logged-in DID holds a current `admin_console_access`
 * certificate. Not a role check — a ledger lookup, same mechanism as
 * anything else in the trust model.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) redirect("/login");

  const authorized = await hasCapability(session.user.did, "admin_console_access");
  if (!authorized) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-md text-center space-y-2">
          <h1 className="text-lg font-semibold text-foreground">Access denied</h1>
          <p className="text-sm text-foreground-500">
            Your account does not hold an <code>admin_console_access</code> certificate.
          </p>
        </div>
      </main>
    );
  }

  const orgName = (await SettingsDAO.get(SETTINGS_KEYS.orgName)) ?? DEFAULT_ORG_NAME;

  return <AppShell orgName={orgName}>{children}</AppShell>;
}
