import { c } from "../../contract";
import { commonErrorResponses } from "../../common";
import {
  BridgeIncomingParamsSchema,
  BridgeIncomingResponseSchema,
} from "./bridges.schemas";

export const bridgesContract = c.router({
  webhookIncoming: {
    method: "POST",
    path: "/api/public/bridges/webhook/:bridgeId/incoming",
    pathParams: BridgeIncomingParamsSchema,
    summary: "Accepts inbound messages from external webhook sources",
    // The handler reads the raw request body (request.text()) to verify the
    // HMAC signature over the exact bytes, so the body is declared as an opaque
    // type — a Zod body would make createNextRoute consume the stream as JSON.
    body: c.type<unknown>(),
    responses: {
      200: BridgeIncomingResponseSchema,
      ...commonErrorResponses,
    },
  },

  teamsIncoming: {
    method: "POST",
    path: "/api/public/bridges/teams/incoming",
    summary: "Process incoming messages from Teams Bot Framework",
    // Raw body needed for Bot Framework auth verification — see above.
    body: c.type<unknown>(),
    responses: {
      200: BridgeIncomingResponseSchema,
      ...commonErrorResponses,
    },
  },
});
