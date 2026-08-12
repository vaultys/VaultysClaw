/**
 * Passwordless VaultysId login — reused unchanged in spirit from
 * packages/control-plane (docs/REBUILD_ARCHITECTURE.md §1: "connecting to
 * the interface stays on the current VaultysId architecture"). Simplified
 * session shape: no `role` field — access is decided by whether the DID
 * holds a current `admin_console_access`/`portal_access` certificate
 * (docs/REBUILD_ARCHITECTURE.md §4.5), not by anything stored on the session.
 */
import type { NextAuthOptions } from "next-auth";
import type { OAuthConfig } from "next-auth/providers/oauth";
import CredentialsProvider from "next-auth/providers/credentials";
import { UserLoginChannel } from "./user-login-channel";
import { UserDAO } from "@/db";
import { providerIdFor, resolveActiveConnections } from "./sso-config";
import { resolveSsoLogin } from "./sso";

declare module "next-auth" {
  interface Session {
    user: { did: string; name: string | null; email: string | null };
  }
  interface User {
    id: string;
    did: string;
    name: string | null;
    email: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    did: string;
    name: string | null;
    email: string | null;
  }
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "VaultysID",
      credentials: { token: { label: "Connection key", type: "text" } },
      async authorize(credentials) {
        if (!credentials?.token) return null;

        const cert = await UserLoginChannel.connecting(credentials.token);
        if (!cert || cert.status !== 2) return null;

        const consumed = await UserLoginChannel.consumeCertificate(credentials.token);
        if (!consumed) return null;

        const metadata = JSON.parse(cert.metadata ?? "{}") as { did?: string };
        if (!metadata.did) return null;

        const actor = await UserDAO.findByDid(metadata.did);
        if (!actor) return null;

        return {
          id: actor.did,
          did: actor.did,
          name: actor.name,
          email: actor.humanProfile?.email ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.did = user.did;
        token.name = user.name;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = { did: token.did, name: token.name, email: token.email };
      return session;
    },
  },
};

/**
 * OIDC / Entra ID sign-in, layered on top of {@link authOptions}.
 *
 * Providers are built **per request from the database**, not from env vars at
 * module load, so adding or disabling a connection in the admin UI takes effect
 * immediately and a deployment can carry more than one IdP at once. That is why
 * `app/api/auth/[...nextauth]/route.ts` awaits this rather than using the static
 * export — but everything else (`getServerSession`, every page and action) keeps
 * importing `authOptions`, because verifying an existing JWT session needs no
 * provider list at all.
 *
 * The interesting part is the `signIn` callback. A successful IdP login does not
 * automatically mean a session: an external identity with no DID bound to it has
 * no place in this trust model, so `resolveSsoLogin` returns a binding URL and
 * this callback returns that URL instead of `true`, which NextAuth turns into a
 * redirect. See `lib/sso.ts` for why that indirection exists rather than a
 * nullable-DID session.
 */
export async function buildAuthOptions(): Promise<NextAuthOptions> {
  const connections = await resolveActiveConnections();

  const ssoProviders: OAuthConfig<Record<string, unknown>>[] = connections.map(
    ({ connection, clientSecret }) => ({
      id: providerIdFor(connection),
      name: connection.name,
      type: "oauth",
      wellKnown: `${connection.issuer}/.well-known/openid-configuration`,
      clientId: connection.clientId,
      clientSecret,
      authorization: { params: { scope: "openid email profile" } },
      idToken: true,
      checks: ["pkce", "state"],
      // Claims only — no DB work here. `profile()` runs before `signIn`, and
      // doing the identity upsert in both places would double-write on every
      // login; `signIn` is where the decision (session vs. bind) is actually made.
      profile(profile: Record<string, unknown>) {
        return {
          id: String(profile.sub ?? ""),
          did: "",
          name: (profile.name as string) ?? (profile.email as string) ?? null,
          email: (profile.email as string) ?? null,
        };
      },
    })
  );

  return {
    ...authOptions,
    providers: [...authOptions.providers, ...ssoProviders],
    callbacks: {
      ...authOptions.callbacks,
      async signIn({ account, profile, user }) {
        // The VaultysId credentials provider authorizes itself; only SSO
        // accounts reach the resolution below.
        if (!account?.provider?.startsWith("sso-")) return true;

        const connectionId = account.provider.slice("sso-".length);
        const claims = profile as
          | { sub?: string; iss?: string; email?: string; name?: string }
          | undefined;
        const subject = claims?.sub ?? user?.id;
        if (!subject) return false;

        const connection = connections.find((c) => c.connection.id === connectionId);
        if (!connection) return false;

        const outcome = await resolveSsoLogin(connectionId, {
          subject: String(subject),
          // The issuer as this connection is configured, not as the token claims
          // it — a token whose `iss` disagrees would be a token from somewhere
          // else, and recording the claimed value would launder that.
          issuer: connection.connection.issuer,
          email: claims?.email ?? user?.email ?? null,
          name: claims?.name ?? user?.name ?? null,
        });

        if (outcome.kind === "bind") return outcome.url;

        // Bound already: hand the DID to the jwt callback, which only ever sees
        // `user` on this first call.
        user.did = outcome.did;
        return true;
      },
    },
  };
}
