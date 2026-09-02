import { VaultysId } from "@vaultys/id";
import { prisma } from "./client";

export class SettingsDAO {
  static async get(key: string): Promise<string | undefined> {
    const row = await prisma.setting.findUnique({ where: { key } });
    return row?.value ?? undefined;
  }

  static async set(key: string, value: string): Promise<void> {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
}

/**
 * The control plane's own VaultysId — the root issuer for the whole
 * certificate ledger (docs/REBUILD_ARCHITECTURE.md §4.5). Every other
 * Actor onboards via a WS handshake; the control plane's own identity is
 * generated once and persisted here.
 */
export class ServerIdentityDAO {
  /**
   * The reconstructed server identity, cached for the process's lifetime.
   *
   * Worth caching because it is on the hottest paths there are — every handshake signs with it,
   * and so does every `cert_status_response` — and because reconstructing it costs a database
   * round trip *plus* ~0.75 ms of key derivation that runs on the event loop. Across a
   * 7,000-Actor ramp that measured as ~5 s of pure blocking CPU spent re-deriving a value that
   * cannot change: `ensureServerIdentity` writes the secret exactly once, at boot, and nothing
   * else ever writes it.
   *
   * Rotating the server identity means restarting the process, which was already true — a running
   * control plane holds live Challenger exchanges keyed to it.
   */
  private static cached: VaultysId | null = null;

  static async ensureServerIdentity(): Promise<void> {
    const existing = await SettingsDAO.get("serverSecret");
    if (existing) return;
    const vid = (await VaultysId.generateMachine()).toVersion(1);
    await SettingsDAO.set("serverSecret", vid.getSecret("base64"));
    // Generating a fresh identity invalidates anything cached from a previous read (in practice
    // there is none — this runs before the server accepts connections — but leaving a stale entry
    // reachable would be a trap for whoever calls this from a test).
    ServerIdentityDAO.cached = null;
  }

  static async getServerSecret(): Promise<string | null> {
    return (await SettingsDAO.get("serverSecret")) || null;
  }

  static async getServerVaultysId(): Promise<VaultysId> {
    if (ServerIdentityDAO.cached) return ServerIdentityDAO.cached;

    const secret = await this.getServerSecret();
    if (!secret) {
      throw new Error(
        "Server VaultysId secret not configured — call ensureServerIdentity() first"
      );
    }
    ServerIdentityDAO.cached = VaultysId.fromSecret(secret, "base64").toVersion(1);
    return ServerIdentityDAO.cached;
  }

  /** Drop the cache. For tests that swap the underlying secret; not needed in production. */
  static resetCache(): void {
    ServerIdentityDAO.cached = null;
  }
}
