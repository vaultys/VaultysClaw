import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-config";

/**
 * Placeholder landing page — the admin console and Access Portal
 * (docs/PAGE_DESIGN.md) don't exist yet. This just proves the login →
 * session round-trip works end to end.
 */
export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) redirect("/login");

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-2">
        <h1 className="text-xl font-semibold">Logged in</h1>
        <p className="text-sm text-gray-600 break-all">{session.user.did}</p>
        <p className="text-xs text-gray-400 pt-4">
          Admin console and Access Portal are not built yet — see
          docs/PAGE_DESIGN.md.
        </p>
      </div>
    </main>
  );
}
