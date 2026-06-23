import { z } from "zod";
import { c } from "../contract";
import { commonErrorResponses } from "../common";
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
import type {
  StorageConfig,
  StorageUpdateResult,
  StorageTestResult,
  StorageMigrateResult,
  DoclingConfig,
  DoclingTestResult,
  LiteLLMStatus,
  LiteLLMMutationResult,
  LiteLLMServiceState,
  OtelConfig,
  OtelTestResult,
  OkResult,
} from "./settings.types";

export const settingsContract = c.router({
  // ── Storage ────────────────────────────────────────────────────────────
  getStorage: {
    method: "GET",
    path: "/api/settings/storage",
    summary: "Retrieve the current storage configuration",
    responses: { 200: c.type<StorageConfig>(), ...commonErrorResponses },
  },

  updateStorage: {
    method: "PUT",
    path: "/api/settings/storage",
    summary: "Update storage configuration settings",
    body: UpdateStorageBodySchema,
    responses: { 200: c.type<StorageUpdateResult>(), ...commonErrorResponses },
  },

  testStorage: {
    method: "POST",
    path: "/api/settings/storage/test",
    summary: "Test storage settings with optional overrides",
    body: TestStorageBodySchema,
    responses: { 200: c.type<StorageTestResult>(), ...commonErrorResponses },
  },

  migrateStorage: {
    method: "POST",
    path: "/api/settings/storage/migrate",
    summary: "Migrate files from legacy BLOB storage to filesystem/S3 storage",
    body: c.noBody(),
    responses: { 200: c.type<StorageMigrateResult>(), ...commonErrorResponses },
  },

  storageLocation: {
    method: "PATCH",
    path: "/api/settings/storage/location",
    summary: "Update or clear object-storage location on infrastructure maps",
    body: LocationBodySchema,
    responses: { 200: c.type<OkResult>(), ...commonErrorResponses },
  },

  // ── LiteLLM ────────────────────────────────────────────────────────────
  getLitellm: {
    method: "GET",
    path: "/api/settings/litellm",
    summary: "Retrieve LiteLLM configuration status and live stats",
    responses: { 200: c.type<LiteLLMStatus>(), ...commonErrorResponses },
  },

  saveLitellm: {
    method: "PUT",
    path: "/api/settings/litellm",
    summary: "Save LiteLLM connection settings and reconnect the service",
    body: SaveLitellmBodySchema,
    responses: {
      200: c.type<LiteLLMMutationResult>(),
      ...commonErrorResponses,
    },
  },

  reconnectLitellm: {
    method: "POST",
    path: "/api/settings/litellm",
    summary: "Reconnect LiteLLM service without changing stored configuration",
    body: c.noBody(),
    responses: {
      200: c.type<LiteLLMMutationResult>(),
      ...commonErrorResponses,
    },
  },

  disconnectLitellm: {
    method: "DELETE",
    path: "/api/settings/litellm",
    summary: "Disconnect and remove stored LiteLLM settings",
    responses: { 200: c.type<OkResult>(), ...commonErrorResponses },
  },

  litellmStatus: {
    method: "GET",
    path: "/api/settings/litellm/status",
    summary: "Check the in-memory status of the LiteLLM service",
    responses: {
      200: c.type<LiteLLMServiceState>(),
      ...commonErrorResponses,
    },
  },

  // ── Docling ────────────────────────────────────────────────────────────
  getDocling: {
    method: "GET",
    path: "/api/settings/docling",
    summary: "Retrieve the Docling configuration settings",
    responses: { 200: c.type<DoclingConfig>(), ...commonErrorResponses },
  },

  updateDocling: {
    method: "PUT",
    path: "/api/settings/docling",
    summary: "Update the Docling configuration settings",
    body: UpdateDoclingBodySchema,
    responses: { 200: c.type<OkResult>(), ...commonErrorResponses },
  },

  testDocling: {
    method: "POST",
    path: "/api/settings/docling/test",
    summary: "Test and discover Docling endpoints",
    body: TestDoclingBodySchema,
    responses: { 200: c.type<DoclingTestResult>(), ...commonErrorResponses },
  },

  doclingLocation: {
    method: "PATCH",
    path: "/api/settings/docling/location",
    summary: "Update or clear Docling service location on maps",
    body: LocationBodySchema,
    responses: { 200: c.type<OkResult>(), ...commonErrorResponses },
  },

  // ── OpenTelemetry ──────────────────────────────────────────────────────
  getOtel: {
    method: "GET",
    path: "/api/settings/otel",
    summary: "Retrieve OpenTelemetry configuration and status",
    responses: { 200: c.type<OtelConfig>(), ...commonErrorResponses },
  },

  saveOtel: {
    method: "PUT",
    path: "/api/settings/otel",
    summary: "Save OpenTelemetry configuration",
    body: SaveOtelBodySchema,
    responses: { 200: c.type<OkResult>(), ...commonErrorResponses },
  },

  testOtel: {
    method: "POST",
    path: "/api/settings/otel",
    summary: "Test OpenTelemetry connectivity",
    body: TestOtelBodySchema,
    responses: { 200: c.type<OtelTestResult>(), ...commonErrorResponses },
  },
});

export const setupContract = c.router({
  status: {
    method: "GET",
    path: "/api/setup/status",
    summary: "Check which setup steps are completed",
    responses: {
      200: z.object({
        status: z.object({
          model: z.boolean(),
          email: z.boolean(),
          users: z.boolean(),
          agent: z.boolean(),
        }),
      }),
      ...commonErrorResponses,
    },
  },
});
