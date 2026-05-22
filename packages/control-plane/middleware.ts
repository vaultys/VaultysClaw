import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(request) {
    const { pathname } = request.nextUrl;

    // Authenticated user visiting /login → redirect to callbackUrl or home
    if (pathname.startsWith("/login") && request.nextauth.token) {
      const callbackUrl = request.nextUrl.searchParams.get("callbackUrl") ?? "/";
      return NextResponse.redirect(new URL(callbackUrl, request.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      // Return true to allow access; false triggers a redirect to the signIn page
      authorized({ req, token }) {
        const { pathname } = req.nextUrl;
        // Always allow: auth callbacks, user-facing P2P/bastion endpoints, login, root (landing page),
        // email invitations, and test/workflow execution endpoints
        if (
          pathname.startsWith("/api/auth") ||
          pathname.startsWith("/api/user") ||
          pathname.startsWith("/api/server") ||
          pathname.startsWith("/api/test") ||
          pathname.startsWith("/api/workflows/test-seed") ||
          pathname.startsWith("/api/invitations") ||
          pathname.startsWith("/api/users/invite/email") ||
          pathname.startsWith("/api/users/invite/from-email") ||
          /^\/api\/workflows\/[^/]+\/execute$/.test(pathname) ||
          pathname.startsWith("/login") ||
          pathname.startsWith("/invite/") ||
          pathname === "/"
        ) {
          return true;
        }
        return !!token;
      },
    },
    pages: { signIn: "/login" },
  },
);

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
