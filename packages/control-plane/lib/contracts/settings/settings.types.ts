import { z } from "zod";
import {
  LocationBodySchema,
  UpdateStorageBodySchema,
  TestStorageBodySchema,
  UpdateDoclingBodySchema,
  TestDoclingBodySchema,
  SaveLitellmBodySchema,
  SaveOtelBodySchema,
  TestOtelBodySchema,
} from "./settings.schemas";

// ─────────────────────────────────────────────
// Body types (inferred from Zod schemas)
// ─────────────────────────────────────────────

export type LocationBody = z.infer<typeof LocationBodySchema>;
export type UpdateStorageBody = z.infer<typeof UpdateStorageBodySchema>;
export type TestStorageBody = z.infer<typeof TestStorageBodySchema>;
export type UpdateDoclingBody = z.infer<typeof UpdateDoclingBodySchema>;
export type TestDoclingBody = z.infer<typeof TestDoclingBodySchema>;
export type SaveLitellmBody = z.infer<typeof SaveLitellmBodySchema>;
export type SaveOtelBody = z.infer<typeof SaveOtelBodySchema>;
export type TestOtelBody = z.infer<typeof TestOtelBodySchema>;

// ─────────────────────────────────────────────
// Response types (DTOs — single source of truth for client + server)
// ─────────────────────────────────────────────

/** Optional location of a backing service on the infrastructure map. */
export interface ServiceLocation {
  locationLat?: number;
  locationLon?: number;
  locationLabel?: string;
}

// ── Storage
export interface StorageConfig extends ServiceLocation {
  storageType: "filesystem" | "s3";
  filesystem: { directory: string };
  s3: {
    enabled: boolean;
    region: string;
    bucket: string;
    endpoint: string | null;
    accessKeyId: string;
    configured: boolean;
  };
}

export interface StorageUpdateResult {
  ok: boolean;
  storageType: string;
  s3: {
    enabled: boolean;
    bucket: string;
    region: string;
    accessKeyId: string;
    configured: boolean;
  };
}

export interface StorageTestResult {
  ok: boolean;
  latency?: number;
  bucket?: string;
  region?: string;
  error?: string;
}

export interface StorageMigrateResult {
  success: boolean;
  migratedCount: number;
  errorCount?: number;
  message: string;
  hasMore?: boolean;
}

// ── Docling
export interface DoclingConfig extends ServiceLocation {
  url: string;
  enabled: boolean;
  configured: boolean;
  sourceEndpoint: string | null;
  fileEndpoint: string | null;
}

export interface DoclingTestResult {
  ok: boolean;
  latency?: number;
  version?: string;
  sourceEndpoint?: string;
  fileEndpoint?: string;
  error?: string;
}

// ── LiteLLM
export type LiteLLMServiceStatus =
  | "unconfigured"
  | "connecting"
  | "connected"
  | "error";

export interface LiteLLMStatus {
  configured: boolean;
  healthy: boolean;
  status: LiteLLMServiceStatus;
  baseUrl: string | null;
  masterKeySet: boolean;
  source: "db" | "env";
  lastError: string | null;
  checkedAt: string | null;
  stats: {
    modelCount: number;
    totalSpend: number | null;
    keyCount: number | null;
  };
}

export interface LiteLLMMutationResult {
  ok: boolean;
  status: string;
  baseUrl: string | null;
}

export interface LiteLLMServiceState {
  status: LiteLLMServiceStatus;
  configured: boolean;
  baseUrl: string | null;
  lastError: string | null;
  checkedAt: string | null;
}

// ── OpenTelemetry
export interface OtelConfig {
  enabled: boolean;
  baseUrl: string;
  serviceName: string;
  connected: boolean;
  fromEnv: {
    enabled: boolean;
    baseUrl: boolean;
    serviceName: boolean;
  };
}

export interface OtelTestResult {
  connected: boolean;
  latency?: number;
  statusCode?: number;
  error?: string;
}

/** Generic acknowledgement returned by mutation endpoints. */
export interface OkResult {
  ok: boolean;
}

export type OpenApiSpec = {
  paths?: Record<string, Record<string, unknown>>;
};
