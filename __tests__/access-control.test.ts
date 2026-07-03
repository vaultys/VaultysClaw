/**
 * Tests for the proxy access-control logic (packages/control-plane/lib/access-control.ts).
 *
 * Verifies page/API access by role:
 *   - /admin*  → Admin or Owner (Member → /app, anonymous → /login)
 *   - /owner*  → Owner only (Admin/Member → /app, anonymous → /login)
 *   - /app*    → any authenticated user (anonymous → /login)
 *   - /api*    → any authenticated user (public API paths excepted)
 *   - public paths → everyone
 */

import { describe, it, expect } from "vitest";
import {
  resolveAccess,
  isPublicPath,
  type AccessToken,
} from "../packages/control-plane/lib/access-control";

const owner: AccessToken = { role: "Owner", did: "did:owner" };
const admin: AccessToken = { role: "Admin", did: "did:admin" };
const member: AccessToken = { role: "Member", did: "did:member" };
const noDidUser: AccessToken = { role: "Member", did: null };

const decide = (path: string, token: AccessToken | null, search = "") =>
  resolveAccess(path, search, token);

describe("resolveAccess — /admin (Admin or Owner)", () => {
  it("allows an Owner", () => {
    expect(decide("/admin/users", owner)).toEqual({ type: "next" });
  });

  it("allows an Admin", () => {
    expect(decide("/admin/agents", admin)).toEqual({ type: "next" });
  });

  it("redirects a Member to /app", () => {
    expect(decide("/admin/settings", member)).toEqual({
      type: "redirect",
      location: "/app",
    });
  });

  it("redirects an anonymous user to /login with callbackUrl", () => {
    const d = decide("/admin/users", null);
    expect(d.type).toBe("redirect");
    expect((d as { location: string }).location).toBe(
      "/login?callbackUrl=%2Fadmin%2Fusers"
    );
  });
});

describe("resolveAccess — /owner (Owner only)", () => {
  it("allows an Owner", () => {
    expect(decide("/owner/dashboard", owner)).toEqual({ type: "next" });
  });

  it("redirects an Admin to /app", () => {
    expect(decide("/owner/dashboard", admin)).toEqual({
      type: "redirect",
      location: "/app",
    });
  });

  it("redirects a Member to /app", () => {
    expect(decide("/owner/dashboard", member)).toEqual({
      type: "redirect",
      location: "/app",
    });
  });

  it("redirects an anonymous user to /login", () => {
    expect(decide("/owner/dashboard", null)).toEqual({
      type: "redirect",
      location: "/login?callbackUrl=%2Fowner%2Fdashboard",
    });
  });
});

describe("resolveAccess — /app (any authenticated user)", () => {
  it.each([owner, admin, member])("allows role %o", (token) => {
    expect(decide("/app/workspaces", token)).toEqual({ type: "next" });
  });

  it("redirects an anonymous user to /login preserving the query string", () => {
    expect(decide("/app/workflows", null, "?tab=runs")).toEqual({
      type: "redirect",
      location: "/login?callbackUrl=%2Fapp%2Fworkflows%3Ftab%3Druns",
    });
  });
});

describe("resolveAccess — /api (authenticated, routes self-check)", () => {
  it("allows any authenticated user", () => {
    expect(decide("/api/agents", member)).toEqual({ type: "next" });
  });

  it("redirects an anonymous user to /login", () => {
    expect(decide("/api/agents", null).type).toBe("redirect");
  });

  it("allows public API paths without a session", () => {
    expect(decide("/api/public/health", null)).toEqual({ type: "next" });
    expect(decide("/api/auth/session", null)).toEqual({ type: "next" });
    expect(decide("/api/workflows/wf-123/execute", null)).toEqual({
      type: "next",
    });
  });
});

describe("resolveAccess — public paths", () => {
  it.each(["/", "/login", "/claim", "/invite/abc"])(
    "allows %s for anonymous users",
    (path) => {
      expect(decide(path, null)).toEqual({ type: "next" });
    }
  );

  it("redirects an authenticated user away from /login to the callbackUrl", () => {
    expect(decide("/login", member, "?callbackUrl=%2Fapp")).toEqual({
      type: "redirect",
      location: "/app",
    });
  });

  it("redirects an authenticated user on /login without callbackUrl to /", () => {
    expect(decide("/login", member)).toEqual({
      type: "redirect",
      location: "/",
    });
  });
});

describe("resolveAccess — OIDC user without a claimed DID", () => {
  it("forces a page navigation to /claim", () => {
    expect(decide("/app/workspaces", noDidUser)).toEqual({
      type: "redirect",
      location: "/claim",
    });
  });

  it("does not force /claim for API routes", () => {
    expect(decide("/api/agents", noDidUser)).toEqual({ type: "next" });
  });

  it("does not loop on the /claim page itself", () => {
    expect(decide("/claim", noDidUser)).toEqual({ type: "next" });
  });
});

describe("resolveAccess — unknown protected paths", () => {
  it("requires authentication", () => {
    expect(decide("/something-else", null).type).toBe("redirect");
    expect(decide("/something-else", member)).toEqual({ type: "next" });
  });
});

describe("isPublicPath", () => {
  it("treats the root and known public prefixes as public", () => {
    expect(isPublicPath("/")).toBe(true);
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/api/public/health")).toBe(true);
  });

  it("treats admin/app paths as non-public", () => {
    expect(isPublicPath("/admin/users")).toBe(false);
    expect(isPublicPath("/app/workspaces")).toBe(false);
  });
});
