import { z } from "zod";
// API keys are serialized with unix-second timestamps (not the Prisma `Date`
// fields), so the route's own `ApiKey` shape is the source of truth here.
import type { ApiKey } from "@/lib/api/utils/api-types";
import {
  ApiKeyCreateRequestSchema,
  ApiKeyUpdateRequestSchema,
} from "./api-keys.schemas";

export type { ApiKey };

export interface ApiKeyListResponse {
  apiKeys: ApiKey[];
}

/** Returned only on creation — includes the full raw key shown once. */
export interface ApiKeyCreatedResponse {
  apiKey: ApiKey;
  key: string;
}

export type ApiKeyCreateRequest = z.infer<typeof ApiKeyCreateRequestSchema>;
export type ApiKeyUpdateRequest = z.infer<typeof ApiKeyUpdateRequestSchema>;
