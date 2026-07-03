import { c } from "../../contract";
import { commonErrorResponses } from "../../common";
import {
  ListIntentsQuerySchema,
  SendIntentBodySchema,
  SendIntentResponseSchema,
} from "./intents.schemas";
import { IntentListResponse } from "./intents.types";

export const intentsContract = c.router({
  send: {
    method: "POST",
    path: "/api/intents",
    summary: "Send an intent to one or more agents",
    body: SendIntentBodySchema,
    responses: {
      202: SendIntentResponseSchema,
      ...commonErrorResponses,
    },
  },

  list: {
    method: "GET",
    path: "/api/intents",
    summary: "List recent intents with their execution results",
    query: ListIntentsQuerySchema,
    responses: {
      200: c.type<IntentListResponse>(),
      ...commonErrorResponses,
    },
  },
});
