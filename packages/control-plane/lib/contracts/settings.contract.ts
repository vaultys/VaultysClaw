import { z } from "zod";
import { c } from "./contract";
import { commonErrorResponses } from "./common";

/** Body for PATCH location endpoints: either coordinates or `{ lat: null }` to clear. */
const LocationBody = z.object({
  lat: z.number().nullable().optional(),
  lon: z.number().optional(),
  label: z.string().nullable().optional(),
});

export const settingsContract = c.router({
  getStorage: {
    method: "GET",
    path: "/api/settings/storage",
    summary: "Retrieve the current storage configuration",
    responses: { 200: c.type<Record<string, unknown>>(), ...commonErrorResponses },
  },

  updateStorage: {
    method: "PUT",
    path: "/api/settings/storage",
    summary: "Update storage configuration settings",
    body: z.object({
      storageType: z.enum(["filesystem", "s3"]).optional(),
      filesystemDir: z.string().optional(),
      s3: z.record(z.string(), z.unknown()).optional(),
    }),
    responses: { 200: c.type<Record<string, unknown>>(), ...commonErrorResponses },
  },

  testStorage: {
    method: "POST",
    path: "/api/settings/storage/test",
    summary: "Test storage settings with optional overrides",
    body: z.object({
      region: z.string().optional(),
      bucket: z.string().optional(),
      endpoint: z.string().optional(),
      accessKeyId: z.string().optional(),
      secretAccessKey: z.string(),
    }),
    responses: { 200: c.type<Record<string, unknown>>(), ...commonErrorResponses },
  },

  migrateStorage: {
    method: "POST",
    path: "/api/settings/storage/migrate",
    summary: "Migrate files from SQLite BLOB storage to filesystem/S3 storage",
    body: c.noBody(),
    responses: { 200: c.type<Record<string, unknown>>(), ...commonErrorResponses },
  },

  storageLocation: {
    method: "PATCH",
    path: "/api/settings/storage/location",
    summary: "Update or clear object-storage location on infrastructure maps",
    body: LocationBody,
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  getLitellm: {
    method: "GET",
    path: "/api/settings/litellm",
    summary: "Retrieve LiteLLM configuration status and live stats",
    responses: { 200: c.type<Record<string, unknown>>(), ...commonErrorResponses },
  },

  saveLitellm: {
    method: "PUT",
    path: "/api/settings/litellm",
    summary: "Save LiteLLM connection settings and reconnect the service",
    body: z.object({ baseUrl: z.string(), masterKey: z.string().nullable().optional() }),
    responses: { 200: c.type<Record<string, unknown>>(), ...commonErrorResponses },
  },

  reconnectLitellm: {
    method: "POST",
    path: "/api/settings/litellm",
    summary: "Reconnect LiteLLM service without changing stored configuration",
    body: c.noBody(),
    responses: { 200: c.type<Record<string, unknown>>(), ...commonErrorResponses },
  },

  disconnectLitellm: {
    method: "DELETE",
    path: "/api/settings/litellm",
    summary: "Disconnect and remove stored LiteLLM settings",
    responses: { 200: z.object({ ok: z.boolean() }), ...commonErrorResponses },
  },

  litellmStatus: {
    method: "GET",
    path: "/api/settings/litellm/status",
    summary: "Check the status of the LiteLLM service",
    responses: { 200: c.type<Record<string, unknown>>(), ...commonErrorResponses },
  },

  getDocling: {
    method: "GET",
    path: "/api/settings/docling",
    summary: "Retrieve the Docling configuration settings",
    responses: { 200: c.type<Record<string, unknown>>(), ...commonErrorResponses },
  },

  updateDocling: {
    method: "PUT",
    path: "/api/settings/docling",
    summary: "Update the Docling configuration settings",
    body: z.object({ url: z.string().optional(), enabled: z.boolean().optional() }),
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  testDocling: {
    method: "POST",
    path: "/api/settings/docling/test",
    summary: "Test and discover Docling endpoints",
    body: z.object({ url: z.string().optional() }),
    responses: { 200: c.type<Record<string, unknown>>(), ...commonErrorResponses },
  },

  doclingLocation: {
    method: "PATCH",
    path: "/api/settings/docling/location",
    summary: "Update or clear Docling service location on maps",
    body: LocationBody,
    responses: { 200: c.type<void>(), ...commonErrorResponses },
  },

  getOtel: {
    method: "GET",
    path: "/api/settings/otel",
    summary: "Retrieve OpenTelemetry configuration and status",
    responses: { 200: c.type<Record<string, unknown>>(), ...commonErrorResponses },
  },

  saveOtel: {
    method: "PUT",
    path: "/api/settings/otel",
    summary: "Save OpenTelemetry configuration",
    body: z.object({
      enabled: z.boolean(),
      baseUrl: z.string().optional(),
      serviceName: z.string().optional(),
    }),
    responses: { 200: c.type<Record<string, unknown>>(), ...commonErrorResponses },
  },

  testOtel: {
    method: "POST",
    path: "/api/settings/otel/test",
    summary: "Test OpenTelemetry connectivity",
    body: z.object({ baseUrl: z.string() }).optional(),
    responses: { 200: c.type<Record<string, unknown>>(), ...commonErrorResponses },
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
