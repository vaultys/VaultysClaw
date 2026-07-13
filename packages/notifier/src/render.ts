import { getNotificationEvent } from "@vaultysclaw/shared";

export interface RenderedNotification {
  title: string;
  body: string;
}

/** Produce the human-readable title/body for an event + payload. */
export function renderNotification(
  eventType: string,
  data: Record<string, unknown>
): RenderedNotification {
  const def = getNotificationEvent(eventType);
  const s = (key: string, fallback: string) =>
    (data[key] as string) || fallback;
  const ws = s("workspaceName", "a workspace");

  switch (eventType) {
    // ── Workspace membership (target = the user themselves) ───────────────────
    case "workspace.member_added":
      return { title: "Added to a workspace", body: `You were added to "${ws}".` };
    case "workspace.member_removed":
      return {
        title: "Removed from a workspace",
        body: `You were removed from "${ws}".`,
      };

    // ── Workspace-scoped entities (audience = workspace members) ───────────────
    case "workspace.agent_added":
      return {
        title: "Agent added",
        body: `${s("agentName", "An agent")} was added to "${ws}".`,
      };
    case "workspace.agent_removed":
      return {
        title: "Agent removed",
        body: `${s("agentName", "An agent")} was removed from "${ws}".`,
      };
    case "workspace.workflow_added":
      return {
        title: "Workflow added",
        body: `${s("workflowName", "A workflow")} was added to "${ws}".`,
      };
    case "workspace.workflow_removed":
      return {
        title: "Workflow removed",
        body: `${s("workflowName", "A workflow")} was removed from "${ws}".`,
      };

    // ── Personal ──────────────────────────────────────────────────────────────
    case "inbox.message":
      return {
        title: "New inbox item",
        body: s("message", "You have a new item in your inbox."),
      };
    case "profile.updated":
      return { title: "Profile updated", body: "Your profile was updated." };
    case "grant.received":
      return {
        title: "Access granted",
        body: `You were granted ${s("capabilities", "new")} access${
          data.agentName ? ` on ${s("agentName", "")}` : ""
        }.`,
      };
    case "grant.revoked":
      return {
        title: "Access revoked",
        body: "One of your capability delegations was revoked.",
      };
    case "tool.approval_required":
      return {
        title: "Tool approval required",
        body: `${s("agentName", "An agent")} is waiting for approval to run ${s(
          "toolName",
          "a tool"
        )}.`,
      };

    // ── Admin ─────────────────────────────────────────────────────────────────
    case "user.joined":
      return {
        title: "New user joined",
        body: `${s("name", "") || s("email", "A new user")} joined VaultysClaw.`,
      };
    case "agent.pending":
      return {
        title: "Agent awaiting approval",
        body: `${s("agentName", "An agent")} requested registration and needs approval.`,
      };
    case "policy.updated":
      return {
        title: "Policy changed",
        body: `A governance policy was ${s("action", "updated")}${
          data.agentName ? ` for ${s("agentName", "")}` : ""
        }.`,
      };
    case "workspace.created":
      return { title: "Workspace created", body: `Workspace "${ws}" was created.` };
    case "workspace.deleted":
      return { title: "Workspace deleted", body: `Workspace "${ws}" was deleted.` };
    case "agent.created":
      return {
        title: "Agent created",
        body: `${s("agentName", "An agent")} was created.`,
      };
    case "agent.deleted":
      return {
        title: "Agent deleted",
        body: `${s("agentName", "An agent")} was deleted.`,
      };
    case "model.added":
      return {
        title: "Model added",
        body: `${s("modelName", "A model")} was added to the registry.`,
      };
    case "model.removed":
      return {
        title: "Model removed",
        body: `${s("modelName", "A model")} was removed from the registry.`,
      };
    case "knowledge.added":
      return {
        title: "Knowledge source added",
        body: `${s("knowledgeName", "A knowledge source")} was added.`,
      };
    case "knowledge.removed":
      return {
        title: "Knowledge source removed",
        body: `${s("knowledgeName", "A knowledge source")} was removed.`,
      };
    case "skill.added":
      return {
        title: "Skill added",
        body: `${s("skillName", "A skill")} was added.`,
      };
    case "skill.removed":
      return {
        title: "Skill removed",
        body: `${s("skillName", "A skill")} was removed.`,
      };
    case "workflow.failed":
      return {
        title: "Workflow run failed",
        body: `${s("workflowName", "A workflow")} run failed.`,
      };
    case "workflow.succeeded":
      return {
        title: "Workflow run succeeded",
        body: `${s("workflowName", "A workflow")} run completed successfully.`,
      };

    default:
      return { title: def?.label ?? "Notification", body: def?.description ?? "" };
  }
}
