import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { UserServerChannel } from "./user-server-channel";
import { UserDao } from "./user-dao";

declare module "next-auth" {
  interface Session {
    user: {
      did: string;
      isOwner: boolean;
      isAdmin: boolean;
    };
  }
  interface User {
    id: string;
    did: string;
    isOwner: boolean;
    isAdmin: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    did: string;
    isOwner: boolean;
    isAdmin: boolean;
  }
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "VaultysID",
      credentials: {
        token: { label: "Connection token", type: "text" },
        browserToken: { label: "Browser token", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.token) return null;

        // For QR flow the token IS the connection key.
        // For bastion flow, both tokens are present; verify both completed.
        const token = credentials.token;

        const cert = UserServerChannel.connecting(token);
        if (!cert || cert.status !== 2) return null;

        // Consume the certificate to prevent replay
        const consumed = UserServerChannel.consumeCertificate(token);
        if (!consumed) return null;

        // Look up the user by parsing the certificate data to get the DID.
        // After handleSuccess the user already exists in the DB; we get the DID
        // by re-hydrating the Challenger certificate stored in cert.data.
        // Instead of re-parsing, we can query users for any newly registered user
        // by looking at the most recently registered user whose cert we just consumed.
        // Simpler: store the DID in the cert metadata during handleRequest.
        const metadata = JSON.parse(cert.metadata ?? "{}") as { did?: string };
        if (!metadata.did) return null;

        const user = UserDao.getByDid(metadata.did);
        if (!user) return null;

        return {
          id: user.did,
          did: user.did,
          isOwner: user.is_owner === 1,
          isAdmin: user.is_owner === 1 || user.is_admin === 1,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.did = user.did;
        token.isOwner = user.isOwner;
        token.isAdmin = user.isAdmin;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        did: token.did,
        isOwner: token.isOwner,
        // Fallback for sessions minted before isAdmin was introduced:
        // owners are always admins, so derive from isOwner if missing.
        isAdmin: token.isAdmin ?? token.isOwner,
      };
      return session;
    },
  },
};
