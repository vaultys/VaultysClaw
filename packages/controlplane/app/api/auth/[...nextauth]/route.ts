import NextAuth from "next-auth";
import { buildAuthOptions } from "@/lib/auth-config";

/**
 * Built per request rather than once at module load, because the SSO provider
 * list comes from the database — a connection added or disabled in the admin UI
 * has to take effect on the next login, not the next deploy. Everything that
 * merely *verifies* a session still imports the static `authOptions`; only the
 * endpoint that actually runs a sign-in flow needs the provider list.
 */
async function handler(req: Request, ctx: unknown) {
  const options = await buildAuthOptions();
  return (NextAuth(options) as (req: Request, ctx: unknown) => Promise<Response>)(req, ctx);
}

export { handler as GET, handler as POST };
