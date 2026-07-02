import { initClient } from "@ts-rest/core";
import {
  aboutContract,
  adminAgentsContract,
  userAgentsContract,
  apiKeysContract,
  bridgesContract,
  channelsContract,
  governanceContract,
  graphContract,
  healthContract,
  intentsContract,
  invitationsContract,
  knowledgeContract,
  litellmContract,
  mapContract,
  modelsContract,
  networkContract,
  orgSkillsContract,
  policiesContract,
  workspacesContract,
  registrationsContract,
  serverContract,
  settingsContract,
  setupContract,
  skillsContract,
  statsContract,
  toolApprovalsContract,
  userAuthContract,
  userStatusContract,
  usersContract,
  workflowApprovalsContract,
  workflowRunsContract,
  workflowsContract,
} from "@/lib/contracts";

/** Shared client options — relative baseUrl keeps calls same-origin in the browser. */
const clientOptions = {
  baseUrl: "",
  baseHeaders: {} as Record<string, string>,
};

/**
 * Per-contract ts-rest clients. One client per domain contract keeps TypeScript
 * inference fast: the language server resolves one small type instead of the
 * entire appContract union (~30 routers merged).
 *
 * Usage:
 * ```ts
 * import { adminAgentsClient, workflowsClient } from "@/lib/api/ts-rest/client";
 * const { items } = unwrap(await adminAgentsClient.search({ query: {} }));
 * ```
 */
export const aboutClient = initClient(aboutContract, clientOptions);
export const adminAgentsClient = initClient(adminAgentsContract, clientOptions);
export const userAgentsClient = initClient(userAgentsContract, clientOptions);
export const apiKeysClient = initClient(apiKeysContract, clientOptions);
export const bridgesClient = initClient(bridgesContract, clientOptions);
export const channelsClient = initClient(channelsContract, clientOptions);
export const governanceClient = initClient(governanceContract, clientOptions);
export const graphClient = initClient(graphContract, clientOptions);
export const healthClient = initClient(healthContract, clientOptions);
export const intentsClient = initClient(intentsContract, clientOptions);
export const invitationsClient = initClient(invitationsContract, clientOptions);
export const knowledgeClient = initClient(knowledgeContract, clientOptions);
export const litellmClient = initClient(litellmContract, clientOptions);
export const mapClient = initClient(mapContract, clientOptions);
export const modelsClient = initClient(modelsContract, clientOptions);
export const networkClient = initClient(networkContract, clientOptions);
export const orgSkillsClient = initClient(orgSkillsContract, clientOptions);
export const policiesClient = initClient(policiesContract, clientOptions);
export const workspacesClient = initClient(workspacesContract, clientOptions);
export const registrationsClient = initClient(
  registrationsContract,
  clientOptions
);
export const serverClient = initClient(serverContract, clientOptions);
export const settingsClient = initClient(settingsContract, clientOptions);
export const setupClient = initClient(setupContract, clientOptions);
export const skillsClient = initClient(skillsContract, clientOptions);
export const statsClient = initClient(statsContract, clientOptions);
export const toolApprovalsClient = initClient(
  toolApprovalsContract,
  clientOptions
);
export const userAuthClient = initClient(userAuthContract, clientOptions);
export const userStatusClient = initClient(userStatusContract, clientOptions);
export const usersClient = initClient(usersContract, clientOptions);
export const workflowApprovalsClient = initClient(
  workflowApprovalsContract,
  clientOptions
);
export const workflowRunsClient = initClient(
  workflowRunsContract,
  clientOptions
);
export const workflowsClient = initClient(workflowsContract, clientOptions);

/** ts-rest responses are a `{ status, body }` union keyed by status code. */
type TsRestResult = { status: number; body: unknown };

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Bridge ts-rest's non-throwing `{ status, body }` result to the rest of the
 * codebase, which expects `BaseApi`-style behaviour: return the body on a 2xx,
 * throw `ApiError` otherwise.
 */
export function unwrap<R extends TsRestResult>(
  result: R
): Extract<R, { status: 200 | 201 | 204 }>["body"] {
  if (result.status >= 200 && result.status < 300) {
    return result.body as Extract<R, { status: 200 | 201 | 204 }>["body"];
  }
  const body = (result.body ?? {}) as {
    error?: string;
    code?: string;
    details?: Record<string, unknown>;
  };
  throw new ApiError(
    result.status,
    body.code ?? "UNKNOWN_ERROR",
    body.error ?? "Request failed",
    body.details
  );
}
