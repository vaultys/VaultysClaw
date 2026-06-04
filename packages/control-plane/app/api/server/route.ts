import { NextResponse } from "next/server";
import os from "os";
import { readFileSync } from "fs";
import { join } from "path";
import { VaultysId } from "@vaultys/id";
import { getWSServer } from "@/lib/ws-server";
import { AgentDAO, SettingsDAO } from "@/db";

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
 * GET /api/server
 * Server identity, status, registered agents summary, and system info.
 */
/**
 * @openapi
 * /api/server:
 *   get:
 *     summary: Retrieve server identity, status, and system info.
 *     tags: [Server]
 *     responses:
 *       200:
 *         description: Successful response with server details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 identity:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     did:
 *                       type: string
 *                     fingerprint:
 *                       type: string
 *                     version:
 *                       type: number
 *                     type:
 *                       type: string
 *                       enum: [machine, person, unknown]
 *                 stats:
 *                   type: object
 *                   properties:
 *                     totalAgents:
 *                       type: integer
 *                     onlineAgents:
 *                       type: integer
 *                     offlineAgents:
 *                       type: integer
 *                 sysInfo:
 *                   type: object
 *                   properties:
 *                     platform:
 *                       type: string
 *                     osType:
 *                       type: string
 *                     osRelease:
 *                       type: string
 *                     hostname:
 *                       type: string
 *                     uptime:
 *                       type: number
 *                     totalMem:
 *                       type: integer
 *                     freeMem:
 *                       type: integer
 *                     cpuCount:
 *                       type: integer
 *                     cpuModel:
 *                       type: string
 *                     loadAvg:
 *                       type: array
 *                       items:
 *                         type: number
 *                     version:
 *                       type: string
 *                 walletUrl:
 *                   type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         description: Internal server error.
 */
export async function GET() {
  try {
    // Server VaultysId identity
    let serverIdentity: Record<string, unknown> | null = null;
    const serverSecret = await SettingsDAO.get("serverSecret");
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
    const allAgents = await AgentDAO.findAll();

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
      walletUrl: await SettingsDAO.get("wallet_url") ?? "https://wallet.vaultys.net",
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch server info" },
      { status: 500 }
    );
  }
}
