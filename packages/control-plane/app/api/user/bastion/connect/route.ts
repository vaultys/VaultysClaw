import { NextRequest, NextResponse } from "next/server";
import { UserServerChannel } from "@/lib/user-server-channel";
import { VaultysId } from "@vaultys/id";

/**
 * GET /api/user/bastion/connect
 * Initiates the bastion (browser-device) connection flow.
 *
 * Query params:
 *   - vid: base64-encoded browser VaultysId public key
 *   - type: "extension" | "browser" (default: "browser")
 *
 * Returns { key: encryptedKey } — the key encrypted for the browser VaultysId.
 * The browser decrypts it using its private VaultysId to get the raw connection key.
 */
export async function GET(request: NextRequest) {
  const browserVid = request.nextUrl.searchParams.get("vid");
  if (!browserVid) {
    return NextResponse.json({ error: "Browser VID not provided" }, { status: 400 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "";
  const userAgent = request.headers.get("user-agent") ?? "";
  const type = request.nextUrl.searchParams.get("type");
  const deviceType = type === "extension" ? ("BROWSER_EXTENSION" as const) : ("BROWSER" as const);

  // Normalise vid to v0 id
  const vaultysId = VaultysId.fromId(Buffer.from(browserVid, "base64")).toVersion(1);
  const vid64 = vaultysId.id.toString("base64");

  const result = await UserServerChannel.handleBastionConnect(vid64, ip, userAgent, deviceType);
  if (!result) return NextResponse.json({ error: "Failed to create bastion certificate" }, { status: 500 });

  return NextResponse.json(result);
}
