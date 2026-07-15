import { z } from "zod";
import {
  EntraConfigSchema,
  SaveServerSettingsBodySchema,
  SmtpConfigSchema,
} from "./server.schemas";

export interface EntraUnclaimedResponse {
  users: Array<Record<string, unknown>>;
}

export type SmtpConfig = z.infer<typeof SmtpConfigSchema>;
export type EntraConfig = z.infer<typeof EntraConfigSchema>;
export type SaveServerSettingsBody = z.infer<
  typeof SaveServerSettingsBodySchema
>;
