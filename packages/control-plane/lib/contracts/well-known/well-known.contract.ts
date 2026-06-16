import { commonErrorResponses } from "../common";
import { c } from "../contract";
import { VaultysWellKnownSchema } from "./well-known.schemas";

export const wellKnownContract = c.router({
  vaultys: {
    method: "GET",
    path: "/.well-known/vaultys.json",
    summary: "Vaultys well-known discovery document",
    responses: {
      200: VaultysWellKnownSchema,
      ...commonErrorResponses,
    },
  },
});
