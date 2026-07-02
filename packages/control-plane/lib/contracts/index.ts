import { c } from "./contract";
import { adminAgentsContract } from "./admin/agents/agents.contract";
import { userAgentsContract } from "./user/agents/agents.contract";
import { aboutContract } from "./public/about/about.contract";
import { apiKeysContract } from "./api-keys/api-keys.contract";
import {
  bridgesContract,
  channelsContract,
} from "./channels/channels.contract";
import { governanceContract } from "./governance/governance.contract";
import { intentsContract } from "./intents/intents.contract";
import { knowledgeContract } from "./knowledge/knowledge.contract";
import { statsContract, userStatusContract } from "./misc/misc.contract";
import { litellmContract, modelsContract } from "./models/models.contract";
import { graphContract } from "./graph/graph.contract";
import {
  healthContract,
  mapContract,
  networkContract,
} from "./network/network.contract";
import { policiesContract } from "./policies/policies.contract";
import { workspacesContract } from "./workspaces/workspaces.contract";
import {
  registrationsContract,
  toolApprovalsContract,
} from "./registrations/registrations.contract";
import { serverContract } from "./server/server.contract";
import { setupContract, settingsContract } from "./settings/settings.contract";
import { orgSkillsContract, skillsContract } from "./skills/skills.contract";
import { userAuthContract } from "./user-auth/user-auth.contract";
import { wellKnownContract } from "./well-known/well-known.contract";
import { invitationsContract, usersContract } from "./users/users.contract";
import {
  workflowApprovalsContract,
  workflowRunsContract,
  workflowsContract,
} from "./workflows/workflows.contract";

export { c } from "./contract";
export * from "./common";

export type * from "./admin/agents/agents.contract";
export * from "./admin/agents/agents.contract";
export * from "./admin/agents/agents.schemas";
export * from "./admin/agents/agents.types";
export type * from "./user/agents/agents.contract";
export * from "./user/agents/agents.contract";
export * from "./public/about/about.contract";
export * from "./public/about/about.schemas";
export * from "./public/about/about.types";
export type * from "./api-keys/api-keys.contract";
export * from "./api-keys/api-keys.contract";
export * from "./api-keys/api-keys.schemas";
export * from "./api-keys/api-keys.types";
export type * from "./channels/channels.contract";
export * from "./channels/channels.contract";
export * from "./channels/channels.schemas";
export * from "./channels/channels.types";
export type * from "./governance/governance.contract";
export * from "./governance/governance.contract";
export * from "./governance/governance.schemas";
export * from "./governance/governance.types";
export type * from "./graph/graph.contract";
export * from "./graph/graph.contract";
export * from "./graph/graph.schemas";
export * from "./graph/graph.types";
export type * from "./intents/intents.contract";
export * from "./intents/intents.contract";
export * from "./intents/intents.schemas";
export * from "./intents/intents.types";
export type * from "./knowledge/knowledge.contract";
export * from "./knowledge/knowledge.contract";
export * from "./knowledge/knowledge.schemas";
export * from "./knowledge/knowledge.types";
export * from "./misc/misc.contract";
export * from "./misc/misc.schemas";
export * from "./misc/misc.types";
export type * from "./models/models.contract";
export * from "./models/models.contract";
export * from "./models/models.schemas";
export * from "./models/models.types";
export type * from "./network/network.contract";
export * from "./network/network.contract";
export * from "./network/network.schemas";
export * from "./network/network.types";
export type * from "./policies/policies.contract";
export * from "./policies/policies.contract";
export * from "./policies/policies.schemas";
export * from "./policies/policies.types";
export type * from "./workspaces/workspaces.contract";
export * from "./workspaces/workspaces.contract";
export * from "./workspaces/workspaces.schemas";
export * from "./workspaces/workspaces.types";
export type * from "./registrations/registrations.contract";
export * from "./registrations/registrations.contract";
export * from "./registrations/registrations.schemas";
export * from "./registrations/registrations.types";
export type * from "./server/server.contract";
export * from "./server/server.contract";
export * from "./server/server.schemas";
export * from "./server/server.types";
export type * from "./settings/settings.contract";
export * from "./settings/settings.contract";
export * from "./settings/settings.schemas";
export * from "./settings/settings.types";
export type * from "./skills/skills.contract";
export * from "./skills/skills.contract";
export * from "./skills/skills.schemas";
export * from "./skills/skills.types";
export type * from "./user-auth/user-auth.contract";
export * from "./user-auth/user-auth.contract";
export * from "./user-auth/user-auth.schemas";
export * from "./user-auth/user-auth.types";
export type * from "./users/users.contract";
export * from "./users/users.contract";
export * from "./users/users.schemas";
export * from "./users/users.types";
export type * from "./well-known/well-known.contract";
export * from "./well-known/well-known.contract";
export * from "./well-known/well-known.schemas";
export * from "./well-known/well-known.types";
export type * from "./workflows/workflows.contract";
export * from "./workflows/workflows.contract";
export * from "./workflows/workflows.schemas";
export * from "./workflows/workflows.types";

/**
 * Aggregate contract — every domain router under a namespaced key. Useful for a
 * single typed client (`initClient(appContract, ...)`) or generating one OpenAPI
 * document. Domain contracts remain independently importable for per-route files.
 */
export const appContract = c.router({
  about: aboutContract,
  agents: adminAgentsContract,
  userAgents: userAgentsContract,
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
  models: modelsContract,
  network: networkContract,
  orgSkills: orgSkillsContract,
  policies: policiesContract,
  workspaces: workspacesContract,
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
