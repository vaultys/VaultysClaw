/**
 * File storage abstraction layer
 * Supports both filesystem and S3 storage strategies.
 *
 * Configuration is stored encrypted in the database (see db.ts → getStorageConfig).
 * No environment variables are needed.
 */

import fs from 'fs';
import path from 'path';

export interface FileStorage {
  write(key: string, content: Buffer): Promise<void>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

/** Full S3 config including plaintext credentials (never stored directly — always encrypted). */
export interface S3Config {
  enabled: boolean;
  region: string;
  bucket: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * Filesystem-based storage.
 * Files are written to baseDir keyed by their path segment.
 */
export class FilesystemStorage implements FileStorage {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
  }

  private resolve(key: string): string {
    const normalized = path.normalize(key).replace(/^(\.\.[/\\])+/, '');
    return path.join(this.baseDir, normalized);
  }

  async write(key: string, content: Buffer): Promise<void> {
    const filePath = this.resolve(key);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content);
  }

  async read(key: string): Promise<Buffer> {
    return fs.readFileSync(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolve(key);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  async exists(key: string): Promise<boolean> {
    return fs.existsSync(this.resolve(key));
  }
}

/**
 * S3-based storage (AWS S3, MinIO, or any S3-compatible service).
 * Credentials are injected at construction time — never read from env.
 */
export class S3Storage implements FileStorage {
  private s3Client: any;
  private bucket: string;

  constructor(config: S3Config) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { S3Client } = require('@aws-sdk/client-s3');

    this.bucket = config.bucket;

    const s3Config: any = {
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    };

    if (config.endpoint) {
      s3Config.endpoint = config.endpoint;
      s3Config.forcePathStyle = true; // required for MinIO
    }

    this.s3Client = new S3Client(s3Config);
  }

  async write(key: string, content: Buffer): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    await this.s3Client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: content }));
  }

  async read(key: string): Promise<Buffer> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    const response = await this.s3Client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const chunks: Buffer[] = [];
    for await (const chunk of response.Body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async delete(key: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    await this.s3Client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async exists(key: string): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { HeadObjectCommand } = require('@aws-sdk/client-s3');
    try {
      await this.s3Client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) return false;
      throw error;
    }
  }
}

/**
 * Generate a stable file key from metadata.
 * Format: sources/{sourceId}/{fileId}_{sanitisedFilename}
 */
export function generateFileKey(sourceId: string, fileId: string, filename: string): string {
  const clean = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
  return `sources/${sourceId}/${fileId}_${clean}`;
}
