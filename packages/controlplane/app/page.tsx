import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-config";
import { hasCapability } from "@/lib/access-control";
import { UserDAO } from "@/db";
import LandingPage from "@/components/marketing/LandingPage";

/** Marketing root for an anonymous visitor; routes a signed-in human to whichever surface their
 *  certificates grant — after the one-time first-login profile-completion prompt (app/welcome),
 *  if they haven't been through it yet. */
export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) return <LandingPage />;

  const actor = await UserDAO.findByDid(session.user.did);
  if (actor?.kind === "human" && !actor.humanProfile?.profileCompletedAt) redirect("/welcome");

  if (await hasCapability(session.user.did, "admin_console_access")) redirect("/admin");
  if (await hasCapability(session.user.did, "portal_access")) redirect("/portal");

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-md text-center space-y-2">
        <h1 className="text-lg font-semibold text-foreground">Signed in</h1>
        <p className="text-sm text-foreground-500 break-all font-mono">{session.user.did}</p>
        <p className="text-sm text-foreground-500 pt-2">
          You don&apos;t hold a certificate granting access to the admin console or the Access
          Portal yet.
        </p>
      </div>
    </main>
  );
}
