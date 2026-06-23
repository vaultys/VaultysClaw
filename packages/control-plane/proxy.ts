import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import type { NextRequestWithAuth } from "next-auth/middleware";

/**
 * Authentication proxy for protected routes.
 * Handles login redirects and token validation.
 */
export default withAuth(
  function proxy(request: NextRequestWithAuth) {
    const { pathname } = request.nextUrl;
    const token = request.nextauth.token;

    // Authenticated user visiting /login → redirect to callbackUrl or home
    if (pathname.startsWith("/login") && token) {
      const callbackUrl =
        request.nextUrl.searchParams.get("callbackUrl") ?? "/";
      return NextResponse.redirect(new URL(callbackUrl, request.url));
    }

    // Authenticated OIDC user without a DID must claim their VaultysId first.
    if (
      token &&
      !token.did &&
      pathname !== "/claim" &&
      !pathname.startsWith("/api/") &&
      !pathname.startsWith("/_next/")
    ) {
      return NextResponse.redirect(new URL("/claim", request.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      // Return true to allow access; false triggers a redirect to the signIn page
      authorized({ req, token }) {
        const { pathname } = req.nextUrl;
        // Always allow: health checks, auth callbacks, user-facing P2P/bastion endpoints, login, root (landing page),
        // email invitations, and test/workflow execution endpoints
        const publicPaths = [
          "/api/health",
          "/api/auth",
          "/api/user",
          "/api/server",
          "/api/test",
          "/api/workflows/test-seed",
          "/api/invitations",
          "/api/users/invite/email",
          "/api/users/invite/from-email",
          "/api/vaultys/",
          "/login",
          "/invite/",
          "/claim",
          "/",
        ];

        // Check if path is public
        const isPublic = publicPaths.some((path) => pathname.startsWith(path));
        if (isPublic) return true;

        // Check workflow execution endpoints (dynamic pattern)
        if (/^\/api\/workflows\/[^/]+\/execute$/.test(pathname)) {
          return true;
        }

        // Require token for all other paths
        return !!token;
      },
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
