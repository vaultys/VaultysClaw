import { NextRequest, NextResponse } from "next/server";
import { UserServerChannel } from "@/lib/user-server-channel";

interface Params {
  params: Promise<{ token: string }>;
}

/**
 * POST /api/user/bastion/listen/[token]
 * Poll whether the bastion connection has been authenticated by the user's wallet.
 * [token] is the connection token.
 *
 * Returns { status: number, browserDid?: string }
 *   status 2 + browserDid → success, browser device DID known
 */
export async function POST(_request: NextRequest, { params }: Params) {
  const { token } = await params;
  const result = UserServerChannel.listenBastion(token);
  if (!result) return NextResponse.json({ status: -1 });
  return NextResponse.json(result);
}
