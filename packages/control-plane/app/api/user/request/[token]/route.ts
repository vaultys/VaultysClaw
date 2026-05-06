import { NextRequest, NextResponse } from "next/server";
import { UserServerChannel } from "@/lib/user-server-channel";

interface Params {
  params: Promise<{ token: string }>;
}

/**
 * POST /api/user/request/[token]
 * Handles one round of the VaultysID Challenger protocol.
 *
 * The [token] is the sha256("vaultys-{key}-server") registration token —
 * this matches the id that BrowserChannel sends to.
 *
 * Body: raw base64 text (CryptoChannel-encrypted challenger certificate bytes)
 * Response: raw base64 text (CryptoChannel-encrypted server certificate bytes)
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { token } = await params;
  const data = await request.text();

  const responseBuffer = await UserServerChannel.handleRequest(token, data);
  return new Response(Buffer.from(responseBuffer).toString("base64"), {
    headers: { "content-type": "text/plain" },
  });
}
