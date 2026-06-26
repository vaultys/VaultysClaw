import { c } from "../contract";
import { commonErrorResponses } from "../common";
import {
  UpdateTelegramBodySchema,
  TestTelegramBodySchema,
} from "./remote-control.schemas";
import type {
  TelegramConfigView,
  TelegramTestResult,
} from "./remote-control.types";

/**
 * Remote-control connectors (Telegram first). Admin-only: lets an operator
 * configure the bot token, allow-list, and target agent for phone control.
 */
export const remoteControlContract = c.router({
  getTelegram: {
    method: "GET",
    path: "/api/remote-control/telegram",
    summary: "Get the Telegram remote-control config (token redacted)",
    responses: { 200: c.type<TelegramConfigView>(), ...commonErrorResponses },
  },

  updateTelegram: {
    method: "PUT",
    path: "/api/remote-control/telegram",
    summary: "Update the Telegram remote-control config",
    body: UpdateTelegramBodySchema,
    responses: { 200: c.type<TelegramConfigView>(), ...commonErrorResponses },
  },

  testTelegram: {
    method: "POST",
    path: "/api/remote-control/telegram/test",
    summary: "Validate a Telegram bot token via getMe",
    body: TestTelegramBodySchema,
    responses: { 200: c.type<TelegramTestResult>(), ...commonErrorResponses },
  },
});
