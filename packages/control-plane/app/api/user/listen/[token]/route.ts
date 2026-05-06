import { NextRequest, NextResponse } from "next/server";
import { UserServerChannel } from "@/lib/user-server-channel";

interface Params {
  params: Promise<{ token: string }>;
}

/**
 * GET /api/user/listen/[token]
 * Poll the status of a connection/registration certificate.
 * [token] is the connection token (sha256("connecting-{key}-vaultys")).
 *
 * Returns { status: number }
 *   -1 = pending
 *    2 = success
 *   -2 = failed
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const { token } = await params;
  const cert = UserServerChannel.listen(token);
  if (!cert) return NextResponse.json({ status: -1 });
  return NextResponse.json({ status: cert.status });
}
