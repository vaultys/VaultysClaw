/**
 * File storage factory that reads config from the database via SettingsDAO.
 * This replaces the getFileStorage / resetFileStorageCache functions from lib/db.ts.
 */

import path from "path";
import type { FileStorage } from "./file-storage";
import { FilesystemStorage, S3Storage } from "./file-storage";
import { SettingsDAO } from "../db";

const globalForStorage = globalThis as unknown as {
  __fileStoragePromise?: Promise<FileStorage>;
};

export function getFileStorage(): Promise<FileStorage> {
  if (!globalForStorage.__fileStoragePromise) {
    globalForStorage.__fileStoragePromise = _initFileStorage();
  }
  return globalForStorage.__fileStoragePromise;
}

export function resetFileStorageCache(): void {
  globalForStorage.__fileStoragePromise = undefined;
}

async function _initFileStorage(): Promise<FileStorage> {
  const { decryptSecret } = await import("./vault");
  const storageType = (await SettingsDAO.get("storage_type")) || "filesystem";

  if (storageType === "s3") {
    const region = (await SettingsDAO.get("s3_region")) ?? "us-east-1";
    const bucket = (await SettingsDAO.get("s3_bucket")) ?? "";
    const endpoint = (await SettingsDAO.get("s3_endpoint")) ?? undefined;
    const encAccessKey = await SettingsDAO.get("s3_access_key_id_enc");
    const encSecretKey = await SettingsDAO.get("s3_secret_access_key_enc");

    if (!bucket || !encAccessKey || !encSecretKey) {
      console.warn("[storage] S3 selected but credentials missing — falling back to filesystem");
    } else {
      try {
        const accessKeyId = await decryptSecret(encAccessKey);
        const secretAccessKey = await decryptSecret(encSecretKey);
        return new S3Storage({ enabled: true, region, bucket, endpoint, accessKeyId, secretAccessKey });
      } catch (err) {
        console.error("[storage] Failed to decrypt S3 credentials — falling back to filesystem", err);
      }
    }
  }

  const dir =
    (await SettingsDAO.get("storage_dir")) ||
    path.resolve(process.cwd(), "data", "knowledge-files");
  return new FilesystemStorage(dir);
}
