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
    <main className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary-50/80 via-background to-background" />
      <div className="pointer-events-none absolute left-1/2 top-[-160px] h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-primary-400/10 blur-3xl" />

      <div className="relative z-10 flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-background-100 p-8 shadow-xl shadow-primary-950/5">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-600 text-white shadow-lg shadow-primary-600/20">
              <UserPlus className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Welcome to VaultysClaw</h1>
              <p className="mt-1 text-sm text-foreground-500">
                Let&apos;s put a name to your VaultysID.
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
                placeholder="Used for email notifications — optional"
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
