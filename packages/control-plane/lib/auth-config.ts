import type { NextAuthOptions } from "next-auth";
import type { Provider } from "next-auth/providers/index";
import CredentialsProvider from "next-auth/providers/credentials";
import { UserServerChannel } from "./user-server-channel";
import { UserDAO } from "@/db";
import { getOidcConfig } from "@/lib/oidc-config";

declare module "next-auth" {
  interface Session {
    user: {
      did: string | null;
      /** Internal DB id — present when did is null (unclaimed OIDC user) */
      userId?: string;
      name?: string | null;
      email?: string | null;
      isOwner: boolean;
      isAdmin: boolean;
    };
  }
  interface User {
    id: string;
    did: string | null;
    isOwner: boolean;
    isAdmin: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    did: string | null;
    /** Internal DB id — always present; equals did for VaultysId users */
    userId?: string;
    name?: string | null;
    email?: string | null;
    isOwner: boolean;
    isAdmin: boolean;
  }
}

const providers: Provider[] = [
  CredentialsProvider({
    name: "VaultysID",
    credentials: {
      token: { label: "Connection token", type: "text" },
      browserToken: { label: "Browser token", type: "text" },
    },
    async authorize(credentials) {
      if (!credentials?.token) return null;

      const token = credentials.token;

      const cert = await UserServerChannel.connecting(token);
      if (!cert || cert.status !== 2) return null;

      const consumed = await UserServerChannel.consumeCertificate(token);
      if (!consumed) return null;

      const metadata = JSON.parse(cert.metadata ?? "{}") as { did?: string };
      if (!metadata.did) return null;

      const user = await UserDAO.findByDid(metadata.did);
      if (!user) return null;

      return {
        id: user.id,
        did: user.did ?? null,
        isOwner: user.isOwner,
        isAdmin: user.isOwner || user.isAdmin,
      };
    },
  }),
];

// ─── Shared callbacks (used by both authOptions and buildAuthOptions) ─────────

const sharedCallbacks: NextAuthOptions["callbacks"] = {
  async jwt({ token, user, trigger }) {
    if (user) {
      token.did = user.did;
      token.userId = user.id;
      token.name = user.name ?? null;
      token.email = user.email ?? null;
      token.isOwner = user.isOwner;
      token.isAdmin = user.isAdmin;
    }
    // After /claim succeeds, the page calls update() which triggers this with trigger="update".
    // Re-fetch from DB so the JWT reflects the newly claimed DID.
    if (trigger === "update" && token.userId && !token.did) {
      try {
        const freshUser = await UserDAO.findById(token.userId);
        if (freshUser?.did) {
          token.did = freshUser.did;
          token.isOwner = freshUser.isOwner;
          token.isAdmin = freshUser.isOwner || freshUser.isAdmin;
        }
      } catch {
        // Leave stale token on transient DB error
      }
    }
    return token;
  },
  async session({ session, token }) {
    // Re-fetch roles from DB on every request so revocations take effect
    // immediately without waiting for JWT expiry (up to 30 days by default).
    if (token.did) {
      try {
        const freshUser = await UserDAO.findByDid(token.did);
        if (freshUser) {
          session.user = {
            did: token.did,
            userId: token.userId,
            name: freshUser.name ?? token.name,
            email: freshUser.email ?? token.email,
            isOwner: freshUser.isOwner,
            isAdmin: freshUser.isOwner || freshUser.isAdmin,
          };
          return session;
        }
      } catch {
        // Fall through to JWT claims on transient DB errors
      }
    }
    session.user = {
      did: token.did,
      userId: token.userId,
      name: token.name,
      email: token.email,
      isOwner: token.isOwner,
      isAdmin: token.isAdmin ?? token.isOwner,
    };
    return session;
  },
};

/**
 * Static authOptions — used everywhere for session validation (getServerSession).
 * Does NOT include the OIDC provider; OIDC is only needed for the login handler.
 */
export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers,
  callbacks: sharedCallbacks,
};

/**
 * Build a full NextAuthOptions including the OIDC provider if one is configured.
 * Called per-request by the NextAuth handler so DB changes take effect immediately.
 */
export async function buildAuthOptions(): Promise<NextAuthOptions> {
  const oidc = await getOidcConfig();
  if (!oidc) return authOptions;

  const oidcProvider: Provider = {
    id: "oidc",
    name: oidc.providerName,
    type: "oauth",
    // wellKnown triggers openid-client discovery. normalizeIssuer() in oidc-config.ts
    // ensures the stored issuer never has the discovery path appended already.
    wellKnown: `${oidc.issuer}/.well-known/openid-configuration`,
    authorization: { params: { scope: "openid email profile" } },
    idToken: true,
    checks: ["pkce", "state"],
    clientId: oidc.clientId,
    clientSecret: oidc.clientSecret,
    profile: async (profile: Record<string, string | undefined>) => {
      const sub = profile.sub!;
      let dbUser = await UserDAO.findByOidcId(sub);
      if (!dbUser) {
        dbUser = await UserDAO.createFromOidc(
          sub,
          oidc.issuer,
          profile.name ?? null,
          profile.email ?? null
        );
      } else {
        // Sync name/email from IdP on every sign-in so the DB stays up-to-date
        // when the user's profile changes in the identity provider.
        dbUser = await UserDAO.syncOidcProfile(
          dbUser.id,
          profile.name ?? null,
          profile.email ?? null
        );
      }
      return {
        id: dbUser.id,
        did: dbUser.did ?? null,
        name: dbUser.name ?? null,
        email: dbUser.email ?? null,
        isOwner: dbUser.isOwner,
        isAdmin: dbUser.isOwner || dbUser.isAdmin,
      };
    },
  } as Provider;

  return {
    ...authOptions,
    providers: [...providers, oidcProvider],
  };
}
