import { NextResponse } from "next/server";
import os from "os";
import { readFileSync } from "fs";
import { join } from "path";
import { VaultysId } from "@vaultys/id";
import { getWSServer } from "@/lib/ws-server";
import { getSetting, getAllAgents } from "@/lib/db";

function getVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8")) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * GET /api/server
 * Server identity, status, registered agents summary, and system info.
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

    // System info
    const cpus = os.cpus();
    const sysInfo = {
      platform: os.platform(),
      osType: os.type(),
      osRelease: os.release(),
      hostname: os.hostname(),
      uptime: os.uptime(),
      totalMem: os.totalmem(),
      freeMem: os.freemem(),
      cpuCount: cpus.length,
      cpuModel: cpus[0]?.model ?? "Unknown",
      loadAvg: os.loadavg(),
      version: getVersion(),
    };

    return NextResponse.json({
      identity: serverIdentity,
      stats: {
        totalAgents: allAgents.length,
        onlineAgents: connectedAgents.length,
        offlineAgents: allAgents.length - connectedAgents.length,
      },
      sysInfo,
      walletUrl: getSetting("wallet_url") ?? "https://wallet.vaultys.net",
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch server info" },
      { status: 500 }
    );
  }
}
