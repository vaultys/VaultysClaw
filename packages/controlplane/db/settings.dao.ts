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
  static async ensureServerIdentity(): Promise<void> {
    const existing = await SettingsDAO.get("serverSecret");
    if (existing) return;
    const vid = (await VaultysId.generateMachine()).toVersion(1);
    await SettingsDAO.set("serverSecret", vid.getSecret("base64"));
  }

  static async getServerSecret(): Promise<string | null> {
    return (await SettingsDAO.get("serverSecret")) || null;
  }

  static async getServerVaultysId(): Promise<VaultysId> {
    const secret = await this.getServerSecret();
    if (!secret) {
      throw new Error(
        "Server VaultysId secret not configured — call ensureServerIdentity() first"
      );
    }
    return VaultysId.fromSecret(secret, "base64").toVersion(1);
  }
}
