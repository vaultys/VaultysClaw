import { BaseApi } from "./base";

export interface ServerInfo {
  version: string;
  buildTime?: string;
  nodeVersion?: string;
  uptime?: number;
  database?: { path: string; sizeBytes?: number };
}

export interface ServerSettings {
  controlPlaneUrl?: string;
  wsPort?: number;
  allowRegistrations?: boolean;
  requireApproval?: boolean;
  [key: string]: unknown;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  fromAddress: string;
  fromName?: string;
}

export interface EntraConfig {
  tenantId: string;
  clientId: string;
  enabled: boolean;
  syncEnabled?: boolean;
  lastSyncAt?: string;
}

export interface StorageConfig {
  type: "local" | "s3" | "azure" | string;
  config: Record<string, unknown>;
}

export interface DoclingConfig {
  baseUrl: string;
  enabled: boolean;
  timeout?: number;
}

export class ServerApi extends BaseApi {
  getInfo() {
    return this.get<ServerInfo>("/api/server");
  }

  getSettings() {
    return this.get<ServerSettings>("/api/server/settings");
  }

  updateSettings(data: Partial<ServerSettings>) {
    return this.put<ServerSettings>("/api/server/settings", data);
  }

  // SMTP
  getSmtp() {
    return this.get<SmtpConfig>("/api/server/smtp");
  }

  updateSmtp(data: SmtpConfig) {
    return this.put<SmtpConfig>("/api/server/smtp", data);
  }

  testSmtp(email: string) {
    return this.post<{ success: boolean; error?: string }>("/api/server/smtp", { email });
  }

  // Entra ID
  getEntra() {
    return this.get<EntraConfig>("/api/server/entra");
  }

  updateEntra(data: Partial<EntraConfig>) {
    return this.put<EntraConfig>("/api/server/entra", data);
  }

  testEntra() {
    return this.post<{ success: boolean; error?: string }>("/api/server/entra");
  }

  listEntraUnclaimed() {
    return this.get<{ users: Record<string, unknown>[] }>("/api/server/entra/unclaimed");
  }

  syncEntra() {
    return this.post<{ jobId: string }>("/api/server/entra/sync");
  }

  sendEntraQr(userId: string) {
    return this.post<void>("/api/server/entra/send-qr", { userId });
  }

  // Storage
  getStorage() {
    return this.get<StorageConfig>("/api/settings/storage");
  }

  updateStorage(data: StorageConfig) {
    return this.put<StorageConfig>("/api/settings/storage", data);
  }

  testStorage(data: StorageConfig) {
    return this.post<{ success: boolean; error?: string }>("/api/settings/storage/test", data);
  }

  migrateStorage(data: { from: StorageConfig; to: StorageConfig }) {
    return this.post<{ jobId: string }>("/api/settings/storage/migrate", data);
  }

  // Docling
  getDocling() {
    return this.get<DoclingConfig>("/api/settings/docling");
  }

  updateDocling(data: DoclingConfig) {
    return this.put<DoclingConfig>("/api/settings/docling", data);
  }

  testDocling() {
    return this.post<{ success: boolean; latencyMs?: number; error?: string }>("/api/settings/docling/test");
  }
}

export const serverApi = new ServerApi();
