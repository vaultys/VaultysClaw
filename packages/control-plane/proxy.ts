import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import type { NextRequestWithAuth } from "next-auth/middleware";
import { resolveAccess, type AccessToken } from "./lib/access-control";

/**
 * Authentication / authorization proxy (Next.js middleware).
 *
 * The access-control decision logic lives in the pure {@link resolveAccess}
 * function (lib/access-control.ts) so it can be unit-tested without NextAuth.
 */
export default withAuth(
  function proxy(request: NextRequestWithAuth) {
    const decision = resolveAccess(
      request.nextUrl.pathname,
      request.nextUrl.search,
      request.nextauth.token as AccessToken | null
    );
    if (decision.type === "redirect") {
      return NextResponse.redirect(new URL(decision.location, request.url));
    }
    return NextResponse.next();
  },
  {
    callbacks: {
      // All access logic lives in resolveAccess, which must run even for
      // anonymous users to build the callbackUrl redirect. Returning true here
      // defers everything to the proxy function above.
      authorized: () => true,
    },
    pages: { signIn: "/login" },
  }
);

// Configure which paths should be processed by this middleware
export const config = {
  matcher: [
    // Run middleware on all paths except static files, images, and media
    "/((?!_next/static|_next/image|favicon.ico|.+\\.(?:png|jpg|jpeg|gif|svg|webp|ico|mp4|webm|ogg|mov|mp3|wav)).*)",
  ],
};
