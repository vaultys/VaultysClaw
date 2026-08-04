/**
 * Passwordless VaultysId login — reused unchanged in spirit from
 * packages/control-plane (docs/REBUILD_ARCHITECTURE.md §1: "connecting to
 * the interface stays on the current VaultysId architecture"). Simplified
 * session shape: no `role` field — access is decided by whether the DID
 * holds a current `admin_console_access`/`portal_access` certificate
 * (docs/REBUILD_ARCHITECTURE.md §4.5), not by anything stored on the session.
 */
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { UserLoginChannel } from "./user-login-channel";
import { UserDAO } from "@/db";

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
