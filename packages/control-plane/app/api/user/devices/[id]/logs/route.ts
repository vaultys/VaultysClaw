import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { IntentDAO, UserDeviceDAO } from "@/db";
import { verifyIntentSignature } from "@/lib/intent-signing";
import { forbidden, notFound, unauthorized } from "@/lib/api/utils/api-utils";
import { withError } from "@/lib/api/handlers/with-error";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/user/devices/[id]/logs
 * All intent interactions initiated by a linked device. Scoped to the device's
 * owner. Each record carries its signed audit metadata + a re-verified flag.
 */
export const GET = withError(async (request: NextRequest, { params }: Params) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.userId) return unauthorized();

  const { id } = await params;
  const device = await UserDeviceDAO.findById(id);
  if (!device) return notFound("Device not found");
  if (device.userId !== session.user.userId) return forbidden();

  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    Math.max(parseInt(searchParams.get("limit") ?? "100", 10) || 100, 1),
    500
  );

  const rows = await IntentDAO.findByInitiator(device.did, limit);
  const logs = await Promise.all(
    rows.map(async (r) => ({
      intentId: r.intentId,
      agentDid: r.agentDid,
      action: r.action,
      decision: r.decision ?? r.status,
      reason: r.reason,
      signature: r.signature,
      verified: await verifyIntentSignature(r.signature, {
        intentId: r.intentId,
        action: r.action,
        agentId: r.agentDid,
      }),
      sentAt: r.sentAt,
    }))
  );

  return NextResponse.json({
    device: { id: device.id, did: device.did, name: device.name },
    logs,
  });
});
