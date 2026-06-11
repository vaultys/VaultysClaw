import NextAuth from "next-auth";
import { buildAuthOptions } from "@/lib/auth-config";

async function handler(req: Request, ctx: { params: Promise<{ nextauth: string[] }> }) {
  const options = await buildAuthOptions();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (NextAuth(options) as any)(req, ctx);
}

export { handler as GET, handler as POST };
