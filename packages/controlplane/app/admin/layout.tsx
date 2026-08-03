import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth-config";
import { hasCapability } from "@/lib/access-control";

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
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-2">
          <h1 className="text-lg font-semibold">Access denied</h1>
          <p className="text-sm text-gray-500">
            Your account does not hold an <code>admin_console_access</code> certificate.
          </p>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b bg-white px-6 py-3 flex items-center gap-6">
        <span className="font-semibold">VaultysClaw Admin</span>
        <nav className="flex gap-4 text-sm text-gray-600">
          <Link href="/admin" className="hover:text-gray-900">
            Overview
          </Link>
          <Link href="/admin/principals" className="hover:text-gray-900">
            Principals
          </Link>
        </nav>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
