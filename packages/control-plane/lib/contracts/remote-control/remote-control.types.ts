import { z } from "zod";
import type { TelegramRemoteControlPublicConfig } from "@/lib/remote-control/types";
import {
  UpdateTelegramBodySchema,
  TestTelegramBodySchema,
} from "./remote-control.schemas";

export type TelegramConfigView = TelegramRemoteControlPublicConfig;

export interface TelegramTestResult {
  ok: boolean;
  /** Bot username when the token is valid. */
  botUsername?: string;
  error?: string;
}

export type UpdateTelegramBody = z.infer<typeof UpdateTelegramBodySchema>;
export type TestTelegramBody = z.infer<typeof TestTelegramBodySchema>;
