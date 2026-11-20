import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { UserPlus } from "lucide-react";
import { authOptions } from "@/lib/auth-config";
import { UserDAO } from "@/db";
import { completeProfileAction, skipProfileAction } from "./actions";

/**
 * One-time first-login profile-completion prompt — a plain self-registered human otherwise stays
 * `name: "Unnamed"` forever with no self-service way to fix it (previously admin-only, via the
 * Actor detail page). Not shown to an invite-onboarded human (already has a real name/email from
 * the invite, `User.profileCompletedAt` is set at creation time for that path) or to anyone who's
 * already been through this once — see app/page.tsx's redirect-here logic.
 */
export default async function WelcomePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) redirect("/login");

  const actor = await UserDAO.findByDid(session.user.did);
  if (!actor || actor.kind !== "human") redirect("/");
  if (actor.humanProfile?.profileCompletedAt) redirect("/");

  return (
    <main className="min-h-screen bg-background">
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-background-100 p-8 shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-neutral-200 bg-background-50 text-foreground-700">
              <UserPlus className="h-5 w-5" strokeWidth={1.5} />
            </span>
            <div>
              <h1 className="text-lg font-medium text-foreground">Name your VaultysID</h1>
              <p className="mt-1 text-sm text-foreground-500">
                Shown to admins on the ledger and in the audit log
              </p>
            </div>
          </div>

          <form action={completeProfileAction} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Name</label>
              <input
                type="text"
                name="name"
                required
                defaultValue={actor.name === "Unnamed" ? "" : actor.name}
                placeholder="Your name"
                autoFocus
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Email (optional)
              </label>
              <input
                type="email"
                name="email"
                defaultValue={actor.humanProfile?.email ?? ""}
                placeholder="For email notifications"
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
              />
            </div>
            <button
              type="submit"
              className="w-full px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Continue
            </button>
          </form>

          <form action={skipProfileAction} className="mt-3 text-center">
            <button
              type="submit"
              className="text-xs text-foreground-400 hover:text-foreground-600 transition-colors underline underline-offset-2"
            >
              Skip for now
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
