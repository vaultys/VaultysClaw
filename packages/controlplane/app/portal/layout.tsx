import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth-config";
import { hasCapability } from "@/lib/access-control";
import SignOutButton from "./SignOutButton";

/**
 * The Access Portal (docs/PAGE_DESIGN.md §2) — a separate, much smaller app
 * from the admin console, gated by `portal_access` instead of
 * `admin_console_access`. No sidebar, no principal management, no audit
 * log — this surface only ever answers "what am I allowed to do."
 */
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) redirect("/login");

  const authorized = await hasCapability(session.user.did, "portal_access");
  if (!authorized) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-md text-center space-y-2">
          <h1 className="text-lg font-semibold text-foreground">Access denied</h1>
          <p className="text-sm text-foreground-500">
            Your account does not hold a <code>portal_access</code> certificate.
          </p>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-neutral-200/60 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-semibold text-sm">VaultysClaw</span>
          <nav className="flex gap-4 text-sm text-foreground-500">
            <Link href="/portal" className="hover:text-foreground transition-colors">
              My Certificates
            </Link>
            <Link href="/portal/agents" className="hover:text-foreground transition-colors">
              My Agents
            </Link>
          </nav>
        </div>
        <SignOutButton />
      </header>
      <main>{children}</main>
    </div>
  );
}
