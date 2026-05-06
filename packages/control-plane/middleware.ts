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
        // Always allow: auth callbacks, user-facing P2P/bastion endpoints, login, and root (landing page)
        // /api/test is gated by ENABLE_TEST_API inside the route handler itself
        // /api/server is the WS-agent registration endpoint (no session needed)
        if (
          pathname.startsWith("/api/auth") ||
          pathname.startsWith("/api/user") ||
          pathname.startsWith("/api/server") ||
          pathname.startsWith("/api/test") ||
          pathname.startsWith("/login") ||
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
