import { z } from "zod";
import {
  AboutQuerySchema,
  AboutResponseSchema,
  UserStatusResponseSchema,
} from "./misc.schemas";

export type AboutQuery = z.infer<typeof AboutQuerySchema>;
export type AboutResponse = z.infer<typeof AboutResponseSchema>;
export type UserStatusResponse = z.infer<typeof UserStatusResponseSchema>;

/** Prompt/completion token totals for a single bucket (day, month, all-time). */
export type TokenBucketTotals = {
  promptTokens: number;
  completionTokens: number;
};

export type StatsTokensResponse = {
  allTime: TokenBucketTotals;
  daily: TokenBucketTotals;
  monthly: TokenBucketTotals;
};
