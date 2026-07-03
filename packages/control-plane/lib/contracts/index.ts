import { c } from "./contract";

// ── Admin domain contracts (lib/contracts/admin/*)
import { adminAgentsContract } from "./admin/agents/agents.contract";
import { apiKeysContract } from "./admin/api-keys/api-keys.contract";
import { channelsContract } from "./admin/channels/channels.contract";
import { governanceContract } from "./admin/governance/governance.contract";
import { graphContract } from "./admin/graph/graph.contract";
import { intentsContract } from "./admin/intents/intents.contract";
import { litellmContract, modelsContract } from "./admin/models/models.contract";
import {
  mapContract,
  networkContract,
} from "./admin/network/network.contract";
import { orgSkillsContract } from "./admin/org-skills/org-skills.contract";
import { policiesContract } from "./admin/policies/policies.contract";
import {
  registrationsContract,
  toolApprovalsContract,
} from "./admin/registrations/registrations.contract";
import { serverContract } from "./admin/server/server.contract";
import { settingsContract } from "./admin/settings/settings.contract";
import { statsContract } from "./admin/stats/stats.contract";
import { invitationsContract, usersContract } from "./admin/users/users.contract";
import { workspacesContract } from "./admin/workspaces/workspaces.contract";

// ── User domain contracts (lib/contracts/user/*)
import { userAgentsContract } from "./user/agents/agents.contract";
import { knowledgeContract } from "./user/knowledge/knowledge.contract";
import { skillsContract } from "./user/skills/skills.contract";
import { userStatusContract } from "./user/user-status/user-status.contract";
import {
  workflowApprovalsContract,
  workflowRunsContract,
  workflowsContract,
} from "./user/workflows/workflows.contract";

// ── Public domain contracts (lib/contracts/public/*)
import { aboutContract } from "./public/about/about.contract";
import { bridgesContract } from "./public/bridges/bridges.contract";
import { healthContract } from "./public/health/health.contract";
import { setupContract } from "./public/setup/setup.contract";
import { userAuthContract } from "./public/user-auth/user-auth.contract";
import { wellKnownContract } from "./public/well-known/well-known.contract";

export { c } from "./contract";
export * from "./common";

// ── Admin re-exports
export type * from "./admin/agents/agents.contract";
export * from "./admin/agents/agents.contract";
export * from "./admin/agents/agents.schemas";
export * from "./admin/agents/agents.types";
export type * from "./admin/api-keys/api-keys.contract";
export * from "./admin/api-keys/api-keys.contract";
export * from "./admin/api-keys/api-keys.schemas";
export * from "./admin/api-keys/api-keys.types";
export type * from "./admin/channels/channels.contract";
export * from "./admin/channels/channels.contract";
export * from "./admin/channels/channels.schemas";
export * from "./admin/channels/channels.types";
export type * from "./admin/governance/governance.contract";
export * from "./admin/governance/governance.contract";
export * from "./admin/governance/governance.schemas";
export * from "./admin/governance/governance.types";
export type * from "./admin/graph/graph.contract";
export * from "./admin/graph/graph.contract";
export * from "./admin/graph/graph.schemas";
export * from "./admin/graph/graph.types";
export type * from "./admin/intents/intents.contract";
export * from "./admin/intents/intents.contract";
export * from "./admin/intents/intents.schemas";
export * from "./admin/intents/intents.types";
export type * from "./admin/models/models.contract";
export * from "./admin/models/models.contract";
export * from "./admin/models/models.schemas";
export * from "./admin/models/models.types";
export type * from "./admin/network/network.contract";
export * from "./admin/network/network.contract";
export * from "./admin/network/network.schemas";
export * from "./admin/network/network.types";
export type * from "./admin/org-skills/org-skills.contract";
export * from "./admin/org-skills/org-skills.contract";
export * from "./admin/org-skills/org-skills.schemas";
export * from "./admin/org-skills/org-skills.types";
export type * from "./admin/policies/policies.contract";
export * from "./admin/policies/policies.contract";
export * from "./admin/policies/policies.schemas";
export * from "./admin/policies/policies.types";
export type * from "./admin/registrations/registrations.contract";
export * from "./admin/registrations/registrations.contract";
export * from "./admin/registrations/registrations.schemas";
export * from "./admin/registrations/registrations.types";
export type * from "./admin/server/server.contract";
export * from "./admin/server/server.contract";
export * from "./admin/server/server.schemas";
export * from "./admin/server/server.types";
export type * from "./admin/settings/settings.contract";
export * from "./admin/settings/settings.contract";
export * from "./admin/settings/settings.schemas";
export * from "./admin/settings/settings.types";
export type * from "./admin/stats/stats.contract";
export * from "./admin/stats/stats.contract";
export * from "./admin/stats/stats.types";
export type * from "./admin/users/users.contract";
export * from "./admin/users/users.contract";
export * from "./admin/users/users.schemas";
export * from "./admin/users/users.types";
export type * from "./admin/workspaces/workspaces.contract";
export * from "./admin/workspaces/workspaces.contract";
export * from "./admin/workspaces/workspaces.schemas";
export * from "./admin/workspaces/workspaces.types";

// ── User re-exports
export type * from "./user/agents/agents.contract";
export * from "./user/agents/agents.contract";
export * from "./user/agents/agents.schemas";
export * from "./user/agents/agents.types";
export type * from "./user/knowledge/knowledge.contract";
export * from "./user/knowledge/knowledge.contract";
export * from "./user/knowledge/knowledge.schemas";
export * from "./user/knowledge/knowledge.types";
export type * from "./user/skills/skills.contract";
export * from "./user/skills/skills.contract";
export * from "./user/skills/skills.schemas";
export * from "./user/skills/skills.types";
export type * from "./user/user-status/user-status.contract";
export * from "./user/user-status/user-status.contract";
export * from "./user/user-status/user-status.schemas";
export * from "./user/user-status/user-status.types";
export type * from "./user/workflows/workflows.contract";
export * from "./user/workflows/workflows.contract";
export * from "./user/workflows/workflows.schemas";
export * from "./user/workflows/workflows.types";

// ── Public re-exports
export * from "./public/about/about.contract";
export * from "./public/about/about.schemas";
export * from "./public/about/about.types";
export type * from "./public/bridges/bridges.contract";
export * from "./public/bridges/bridges.contract";
export * from "./public/bridges/bridges.schemas";
export type * from "./public/health/health.contract";
export * from "./public/health/health.contract";
export * from "./public/health/health.schemas";
export type * from "./public/setup/setup.contract";
export * from "./public/setup/setup.contract";
export type * from "./public/user-auth/user-auth.contract";
export * from "./public/user-auth/user-auth.contract";
export * from "./public/user-auth/user-auth.schemas";
export * from "./public/user-auth/user-auth.types";
export type * from "./public/well-known/well-known.contract";
export * from "./public/well-known/well-known.contract";
export * from "./public/well-known/well-known.schemas";
export * from "./public/well-known/well-known.types";

/**
 * Audience-grouped contracts. Each domain router is mounted under its own key
 * inside one of three grouping routers — `admin`, `user`, `public` — so callers
 * can navigate the contract tree by audience (e.g. `adminContract.agents.search`).
 *
 * Grouping is **purely structural**: every route keeps its absolute `path`, so
 * nesting changes no URL. Contract folders live under `lib/contracts/<audience>/`.
 */
export const adminContract = c.router({
  agents: adminAgentsContract,
  workspaces: workspacesContract,
  users: usersContract,
  invitations: invitationsContract,
  policies: policiesContract,
  governance: governanceContract,
  models: modelsContract,
  litellm: litellmContract,
  server: serverContract,
  settings: settingsContract,
  apiKeys: apiKeysContract,
  registrations: registrationsContract,
  toolApprovals: toolApprovalsContract,
  channels: channelsContract,
  network: networkContract,
  map: mapContract,
  graph: graphContract,
  intents: intentsContract,
  stats: statsContract,
  orgSkills: orgSkillsContract,
});

export const userContract = c.router({
  agents: userAgentsContract,
  userStatus: userStatusContract,
  knowledge: knowledgeContract,
  skills: skillsContract,
  workflows: workflowsContract,
  workflowRuns: workflowRunsContract,
  workflowApprovals: workflowApprovalsContract,
});

export const publicContract = c.router({
  about: aboutContract,
  bridges: bridgesContract,
  wellKnown: wellKnownContract,
  setup: setupContract,
  userAuth: userAuthContract,
  health: healthContract,
});

/**
 * Aggregate contract — the three audience groups nested under `admin` / `user` /
 * `public`. Used to generate one OpenAPI document (grouped tags) and derive the
 * API-key route tree. Domain and group contracts remain independently importable
 * for per-route files and grouped clients.
 */
export const appContract = c.router({
  admin: adminContract,
  user: userContract,
  public: publicContract,
});
