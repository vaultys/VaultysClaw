import { c } from "./contract";
import { agentsContract } from "./agents/agents.contract";
import { apiKeysContract, chatContract } from "./api-keys.contract";
import { bridgesContract, channelsContract } from "./channels.contract";
import { governanceContract } from "./governance.contract";
import { intentsContract } from "./intents.contract";
import { knowledgeContract } from "./knowledge.contract";
import {
    aboutContract,
    statsContract,
    userStatusContract,
} from "./misc.contract";
import { litellmContract, modelsContract } from "./models.contract";
import {
    graphContract,
    healthContract,
    mapContract,
    networkContract,
} from "./network.contract";
import { policiesContract } from "./policies.contract";
import { realmsContract } from "./realms.contract";
import {
    registrationsContract,
    toolApprovalsContract,
} from "./registrations.contract";
import { serverContract } from "./server.contract";
import { setupContract, settingsContract } from "./settings.contract";
import { orgSkillsContract, skillsContract } from "./skills.contract";
import { userAuthContract } from "./user-auth.contract";
import {
    invitationsContract,
    meContract,
    usersContract,
} from "./users.contract";
import {
    workflowApprovalsContract,
    workflowRunsContract,
    workflowsContract,
} from "./workflows.contract";

export { c } from "./contract";
export * from "./common";

export type * from "./agents/agents.contract";
export * from "./agents/agents.contract";
export * from "./agents/agents.schemas";
export * from "./agents/agents.types";
export * from "./api-keys.contract";
export * from "./channels.contract";
export * from "./governance.contract";
export * from "./intents.contract";
export * from "./knowledge.contract";
export * from "./misc.contract";
export * from "./models.contract";
export * from "./network.contract";
export * from "./policies.contract";
export * from "./realms.contract";
export * from "./registrations.contract";
export * from "./server.contract";
export * from "./settings.contract";
export * from "./skills.contract";
export * from "./user-auth.contract";
export * from "./users.contract";
export * from "./workflows.contract";

/**
 * Aggregate contract — every domain router under a namespaced key. Useful for a
 * single typed client (`initClient(appContract, ...)`) or generating one OpenAPI
 * document. Domain contracts remain independently importable for per-route files.
 */
export const appContract = c.router({
  about: aboutContract,
  agents: agentsContract,
  apiKeys: apiKeysContract,
  bridges: bridgesContract,
  channels: channelsContract,
  chat: chatContract,
  governance: governanceContract,
  graph: graphContract,
  health: healthContract,
  intents: intentsContract,
  invitations: invitationsContract,
  knowledge: knowledgeContract,
  litellm: litellmContract,
  map: mapContract,
  me: meContract,
  models: modelsContract,
  network: networkContract,
  orgSkills: orgSkillsContract,
  policies: policiesContract,
  realms: realmsContract,
  registrations: registrationsContract,
  server: serverContract,
  settings: settingsContract,
  setup: setupContract,
  skills: skillsContract,
  stats: statsContract,
  toolApprovals: toolApprovalsContract,
  userAuth: userAuthContract,
  userStatus: userStatusContract,
  users: usersContract,
  workflows: workflowsContract,
  workflowRuns: workflowRunsContract,
  workflowApprovals: workflowApprovalsContract,
});
