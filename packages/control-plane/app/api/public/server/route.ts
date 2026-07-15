import os from "os";
import { readFileSync } from "fs";
import { join } from "path";
import { VaultysId } from "@vaultys/id";
import { getWSServer } from "@/lib/ws-server";
import { AgentDAO, SettingsDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { publicContract } from "@/lib/contracts";

function getVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf-8")
    ) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * GET /api/public/server — server identity, status, agent summary, and system info.
 */
const handlers = createNextRoute(publicContract.server, {
  get: async () => {
    // Server VaultysId identity
    let identity: Record<string, unknown> | null = null;
    const serverSecret = await SettingsDAO.get("serverSecret");
    if (serverSecret) {
      try {
        const vid = VaultysId.fromSecret(serverSecret, "base64").toVersion(1);
        identity = {
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

    const wsServer = getWSServer();
    const connectedAgents = wsServer?.getConnectedAgents() ?? [];
    const allAgents = await AgentDAO.findAll();

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

    return {
      status: 200,
      body: {
        identity,
        stats: {
          totalAgents: allAgents.length,
          onlineAgents: connectedAgents.length,
          offlineAgents: allAgents.length - connectedAgents.length,
        },
        sysInfo,
        walletUrl:
          (await SettingsDAO.get("wallet_url")) ?? "https://wallet.vaultys.net",
      },
    };
  },
});

export const GET = handlers.GET!;
