import { c } from "./contract";
import { agentsContract } from "./agents/agents.contract";
import { apiKeysContract } from "./api-keys.contract";
import { bridgesContract, channelsContract } from "./channels.contract";
import { governanceContract } from "./governance/governance.contract";
import { intentsContract } from "./intents.contract";
import { knowledgeContract } from "./knowledge.contract";
import {
  aboutContract,
  statsContract,
  userStatusContract,
} from "./misc/misc.contract";
import { litellmContract, modelsContract } from "./models/models.contract";
import {
  graphContract,
  healthContract,
  mapContract,
  networkContract,
} from "./network.contract";
import { policiesContract } from "./policies/policies.contract";
import { realmsContract } from "./realms.contract";
import {
  registrationsContract,
  toolApprovalsContract,
} from "./registrations.contract";
import { serverContract } from "./server.contract";
import { setupContract, settingsContract } from "./settings.contract";
import { orgSkillsContract, skillsContract } from "./skills.contract";
import { userAuthContract } from "./user-auth.contract";
import { wellKnownContract } from "./well-known/well-known.contract";
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
export type * from "./governance/governance.contract";
export * from "./governance/governance.contract";
export * from "./governance/governance.schemas";
export * from "./governance/governance.types";
export * from "./intents.contract";
export * from "./knowledge.contract";
export * from "./misc/misc.contract";
export * from "./misc/misc.schemas";
export * from "./misc/misc.types";
export type * from "./models/models.contract";
export * from "./models/models.contract";
export * from "./models/models.schemas";
export * from "./models/models.types";
export * from "./network.contract";
export type * from "./policies/policies.contract";
export * from "./policies/policies.contract";
export * from "./policies/policies.schemas";
export * from "./policies/policies.types";
export * from "./realms.contract";
export * from "./registrations.contract";
export * from "./server.contract";
export * from "./settings.contract";
export * from "./skills.contract";
export * from "./user-auth.contract";
export * from "./users.contract";
export type * from "./well-known/well-known.contract";
export * from "./well-known/well-known.contract";
export * from "./well-known/well-known.schemas";
export * from "./well-known/well-known.types";
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
  wellKnown: wellKnownContract,
  workflows: workflowsContract,
  workflowRuns: workflowRunsContract,
  workflowApprovals: workflowApprovalsContract,
});
