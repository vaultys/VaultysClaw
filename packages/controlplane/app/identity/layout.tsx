import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { authOptions } from "@/lib/auth-config";
import SignOutButton from "@/components/SignOutButton";

/**
 * "My identity" — gated on holding a session and nothing else.
 *
 * Deliberately not under `/admin` or `/portal`. Those are gated on
 * `admin_console_access` and `portal_access` respectively, and a human is
 * guaranteed neither — so putting this page inside either would make it
 * unreachable for exactly the person who most needs it: someone who has signed
 * in and wants to see what, if anything, they hold. Your own identity is not a
 * privilege, so it is not behind a capability check.
 */
export default async function IdentityLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) redirect("/login");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-neutral-200/60 px-6 py-3">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-foreground-500 transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            VaultysClaw
          </Link>
        </div>
        <SignOutButton />
      </header>
      <main>{children}</main>
    </div>
  );
}
