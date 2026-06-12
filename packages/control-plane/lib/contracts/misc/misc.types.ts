import { z } from "zod";
import {
  AboutQuerySchema,
  AboutResponseSchema,
  UserStatusResponseSchema,
} from "./misc.schemas";

export type AboutQuery = z.infer<typeof AboutQuerySchema>;
export type AboutResponse = z.infer<typeof AboutResponseSchema>;
export type UserStatusResponse = z.infer<typeof UserStatusResponseSchema>;

export type StatsTokensResponse = {
  allTime: Record<string, unknown>;
  daily: Record<string, unknown>;
  monthly: Record<string, unknown>;
};
