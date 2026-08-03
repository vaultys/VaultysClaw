import { UserLoginChannel } from "@/lib/user-login-channel";

/**
 * POST /api/public/user/request/[token] — one round of the classic Challenger
 * protocol, used by dev-mode "connect without the app" (lib/browser-connect.ts).
 *
 * [token] is sha256("vaultys-{key}-server") — the id BrowserChannel posts to.
 * Body/response are both raw base64 text (CryptoChannel-encrypted cert bytes).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const data = await request.text();

  const responseBuffer = await UserLoginChannel.handleRequest(token, data);
  return new Response(Buffer.from(responseBuffer).toString("base64"), {
    headers: { "content-type": "text/plain" },
  });
}
