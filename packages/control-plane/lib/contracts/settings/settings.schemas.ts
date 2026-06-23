import { z } from "zod";

// ── Bodies

/** Body for PATCH location endpoints: either coordinates or `{ lat: null }` to clear. */
export const LocationBodySchema = z.object({
  lat: z.number().nullable().optional(),
  lon: z.number().optional(),
  label: z.string().nullable().optional(),
});

export const UpdateStorageBodySchema = z.object({
  storageType: z.enum(["filesystem", "s3"]).optional(),
  filesystemDir: z.string().optional(),
  s3: z
    .object({
      enabled: z.boolean().optional(),
      region: z.string().optional(),
      bucket: z.string().optional(),
      endpoint: z.string().optional(),
      accessKeyId: z.string().optional(),
      secretAccessKey: z.string().optional(),
    })
    .optional(),
});

export const TestStorageBodySchema = z.object({
  region: z.string().optional(),
  bucket: z.string().optional(),
  endpoint: z.string().optional(),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
});

export const UpdateDoclingBodySchema = z.object({
  url: z.string().optional(),
  enabled: z.boolean().optional(),
});

export const TestDoclingBodySchema = z.object({ url: z.string().optional() });

export const SaveLitellmBodySchema = z.object({
  baseUrl: z.string(),
  masterKey: z.string().nullable().optional(),
});

export const SaveOtelBodySchema = z.object({
  enabled: z.boolean(),
  baseUrl: z.string().optional(),
  serviceName: z.string().optional(),
});

export const TestOtelBodySchema = z.object({ baseUrl: z.string() });
