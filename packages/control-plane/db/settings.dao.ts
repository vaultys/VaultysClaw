import path from "path";
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

  static async getMany(keys: string[]): Promise<Record<string, string>> {
    const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  static async delete(key: string): Promise<void> {
    await prisma.setting.deleteMany({ where: { key } });
  }
}

export class ServerIdentityDAO {
  static async ensureServerIdentity() {
    const existing = await SettingsDAO.get("serverSecret");
    if (existing) return;
    const vid = (await VaultysId.generateMachine()).toVersion(1);
    await SettingsDAO.set("serverSecret", vid.getSecret("base64"));
  }
  static async getServerSecret() {
    return (await SettingsDAO.get("serverSecret")) || null;
  }
}

export async function getDoclingConfig() {
  const url = await SettingsDAO.get("docling_url");
  if (!url) return null;
  const latStr = await SettingsDAO.get("docling_location_lat");
  const lonStr = await SettingsDAO.get("docling_location_lon");
  const parsedLat = latStr ? parseFloat(latStr) : NaN;
  const parsedLon = lonStr ? parseFloat(lonStr) : NaN;
  return {
    url,
    enabled: (await SettingsDAO.get("docling_enabled")) === "true",
    sourceEndpoint: (await SettingsDAO.get("docling_source_endpoint")) || undefined,
    fileEndpoint: (await SettingsDAO.get("docling_file_endpoint")) || undefined,
    locationLat: Number.isFinite(parsedLat) ? parsedLat : undefined,
    locationLon: Number.isFinite(parsedLon) ? parsedLon : undefined,
    locationLabel: (await SettingsDAO.get("docling_location_label")) || undefined,
  };
}

export async function setDoclingConfig(cfg: { url: string; enabled: boolean; sourceEndpoint?: string; fileEndpoint?: string; locationLat?: number | null; locationLon?: number | null; locationLabel?: string | null }) {
  await SettingsDAO.set("docling_url", cfg.url.trim().replace(/\/$/, ""));
  await SettingsDAO.set("docling_enabled", cfg.enabled ? "true" : "false");
  if (cfg.sourceEndpoint) await SettingsDAO.set("docling_source_endpoint", cfg.sourceEndpoint);
  if (cfg.fileEndpoint) await SettingsDAO.set("docling_file_endpoint", cfg.fileEndpoint);
  if (cfg.locationLat === null) await SettingsDAO.delete("docling_location_lat");
  else if (cfg.locationLat !== undefined) await SettingsDAO.set("docling_location_lat", String(cfg.locationLat));
  if (cfg.locationLon === null) await SettingsDAO.delete("docling_location_lon");
  else if (cfg.locationLon !== undefined) await SettingsDAO.set("docling_location_lon", String(cfg.locationLon));
  if (cfg.locationLabel === null) await SettingsDAO.delete("docling_location_label");
  else if (cfg.locationLabel !== undefined) await SettingsDAO.set("docling_location_label", cfg.locationLabel);
}

export async function setDoclingEndpoints(sourceEndpoint: string, fileEndpoint: string) {
  await SettingsDAO.set("docling_source_endpoint", sourceEndpoint);
  await SettingsDAO.set("docling_file_endpoint", fileEndpoint);
}

export async function getStorageConfig() {
  const { decryptSecret } = await import("../lib/vault");
  const storageType = (await SettingsDAO.get("storage_type")) || "filesystem";
  const filesystemDir = (await SettingsDAO.get("storage_dir")) || path.resolve(process.cwd(), "data", "knowledge-files");
  const s3Enabled = (await SettingsDAO.get("s3_enabled")) === "true";
  const s3Region = (await SettingsDAO.get("s3_region")) || "us-east-1";
  const s3Bucket = (await SettingsDAO.get("s3_bucket")) || "";
  const s3Endpoint = (await SettingsDAO.get("s3_endpoint")) || undefined;
  let s3AccessKeyId;
  const encAccessKey = await SettingsDAO.get("s3_access_key_id_enc");
  if (encAccessKey) { try { s3AccessKeyId = await decryptSecret(encAccessKey); } catch { } }
  const latStr = await SettingsDAO.get("s3_location_lat");
  const lonStr = await SettingsDAO.get("s3_location_lon");
  const parsedLat = latStr ? parseFloat(latStr) : NaN;
  const parsedLon = lonStr ? parseFloat(lonStr) : NaN;
  return {
    storageType, filesystemDir, s3Enabled, s3Region, s3Bucket, s3Endpoint, s3AccessKeyId,
    locationLat: Number.isFinite(parsedLat) ? parsedLat : undefined,
    locationLon: Number.isFinite(parsedLon) ? parsedLon : undefined,
    locationLabel: (await SettingsDAO.get("s3_location_label")) || undefined,
  };
}

export async function setStorageConfig(cfg: { storageType?: string; filesystemDir?: string; s3Enabled?: boolean; s3Region?: string; s3Bucket?: string; s3Endpoint?: string; s3AccessKeyId?: string; s3SecretAccessKey?: string; locationLat?: number | null; locationLon?: number | null; locationLabel?: string | null }) {
  const { encryptSecret } = await import("../lib/vault");
  if (cfg.storageType !== undefined) await SettingsDAO.set("storage_type", cfg.storageType);
  if (cfg.filesystemDir !== undefined) await SettingsDAO.set("storage_dir", cfg.filesystemDir);
  if (cfg.s3Enabled !== undefined) await SettingsDAO.set("s3_enabled", cfg.s3Enabled ? "true" : "false");
  if (cfg.s3Region !== undefined) await SettingsDAO.set("s3_region", cfg.s3Region);
  if (cfg.s3Bucket !== undefined) await SettingsDAO.set("s3_bucket", cfg.s3Bucket);
  if (cfg.s3Endpoint !== undefined) await SettingsDAO.set("s3_endpoint", cfg.s3Endpoint);
  if (cfg.s3AccessKeyId !== undefined) await SettingsDAO.set("s3_access_key_id_enc", await encryptSecret(cfg.s3AccessKeyId));
  if (cfg.s3SecretAccessKey !== undefined) await SettingsDAO.set("s3_secret_access_key_enc", await encryptSecret(cfg.s3SecretAccessKey));
  if (cfg.locationLat === null) await SettingsDAO.delete("s3_location_lat");
  else if (cfg.locationLat !== undefined) await SettingsDAO.set("s3_location_lat", String(cfg.locationLat));
  if (cfg.locationLon === null) await SettingsDAO.delete("s3_location_lon");
  else if (cfg.locationLon !== undefined) await SettingsDAO.set("s3_location_lon", String(cfg.locationLon));
  if (cfg.locationLabel === null) await SettingsDAO.delete("s3_location_label");
  else if (cfg.locationLabel !== undefined) await SettingsDAO.set("s3_location_label", cfg.locationLabel);
}
