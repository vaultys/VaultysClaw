import { NextResponse } from "next/server";
import { VaultysId } from "@vaultys/id";
import { getWSServer } from "@/lib/ws-server";
import { getSetting, getAllAgents, getActivityLog } from "@/lib/db";

/**
 * GET /api/server
 * Server identity, status, registered agents summary, and activity log
 */
export async function GET() {
  try {
    // Server VaultysId identity
    let serverIdentity: Record<string, unknown> | null = null;
    const serverSecret = getSetting("serverSecret");
    if (serverSecret) {
      try {
        const vid = VaultysId.fromSecret(serverSecret, "base64").toVersion(1);
        serverIdentity = {
          did: vid.did,
          fingerprint: vid.fingerprint,
          version: vid.version,
          type: vid.isMachine()
            ? "machine"
            : vid.isPerson()
              ? "person"
              : "unknown",
        };
      } catch {
        // ignore
      }
    }

    // Connected agents summary
    const wsServer = getWSServer();
    const connectedAgents = wsServer?.getConnectedAgents() ?? [];
    const allAgents = getAllAgents();

    // Activity log
    const activityLog = getActivityLog(200);

    return NextResponse.json({
      identity: serverIdentity,
      stats: {
        totalAgents: allAgents.length,
        onlineAgents: connectedAgents.length,
        offlineAgents: allAgents.length - connectedAgents.length,
      },
      activityLog,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch server info" },
      { status: 500 }
    );
  }
}
