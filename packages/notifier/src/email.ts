import { notificationAction } from "@vaultysclaw/shared";
import { renderNotification } from "./render";

/**
 * Rich HTML email rendering for notifications. `buildEmail` turns an event +
 * payload into a branded email with a details table and (when relevant) a
 * call-to-action button that deep-links into the app.
 *
 * Kept pure (no Prisma / env reads) so it can be unit-tested; the base URL and
 * optional resolved actor name are passed in by the caller.
 */

export interface EmailAction {
  label: string;
  /** Absolute URL. */
  url: string;
}

export interface DetailRow {
  label: string;
  value: string;
}

export interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

// VaultysClaw email branding (matches the existing invite / claim emails).
const ACCENT = "#4f46e5";
const MUTED = "#6b7280";

export function escapeHtml(input: unknown): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Wrap content in the branded, responsive-ish email layout. */
export function renderEmailLayout(opts: {
  title: string;
  intro: string;
  details: DetailRow[];
  action?: EmailAction;
  prefsUrl?: string;
}): string {
  const detailRows = opts.details
    .filter((d) => d.value != null && String(d.value).trim() !== "")
    .map(
      (d) => `
        <tr>
          <td style="padding:6px 12px 6px 0;color:${MUTED};font-size:13px;white-space:nowrap;vertical-align:top">${escapeHtml(
            d.label
          )}</td>
          <td style="padding:6px 0;color:#111827;font-size:13px;vertical-align:top">${escapeHtml(
            d.value
          )}</td>
        </tr>`
    )
    .join("");

  const detailsBlock = detailRows
    ? `<table style="margin:16px 0;border-collapse:collapse;width:100%;background:#f9fafb;border-radius:8px;padding:4px">
         <tbody>${detailRows}</tbody>
       </table>`
    : "";

  const actionBlock = opts.action
    ? `<div style="margin:24px 0;text-align:center">
         <a href="${escapeHtml(opts.action.url)}"
            style="display:inline-block;background:${ACCENT};color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
           ${escapeHtml(opts.action.label)}
         </a>
       </div>`
    : "";

  const prefs = opts.prefsUrl
    ? `<br>You can change what you get notified about in your
       <a href="${escapeHtml(opts.prefsUrl)}" style="color:${MUTED}">notification settings</a>.`
    : "";

  return `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111827">
  <h2 style="color:${ACCENT};margin:0 0 12px">${escapeHtml(opts.title)}</h2>
  <p style="font-size:14px;line-height:1.5;margin:0">${escapeHtml(opts.intro)}</p>
  ${detailsBlock}
  ${actionBlock}
  <p style="font-size:12px;color:${MUTED};margin-top:28px">
    You received this email because of your VaultysClaw notification preferences.${prefs}
  </p>
</div>`;
}

function abs(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

/** Plain-text fallback derived from the same content. */
function toText(intro: string, details: DetailRow[], action?: EmailAction): string {
  const lines = [intro, ""];
  for (const d of details) {
    if (d.value != null && String(d.value).trim() !== "")
      lines.push(`${d.label}: ${d.value}`);
  }
  if (action) {
    lines.push("", `${action.label}: ${action.url}`);
  }
  return lines.join("\n");
}

/**
 * Build the full email (subject/html/text) for an event. `actorName` is the
 * resolved display name of `data.actorDid` when available.
 */
export function buildEmail(
  eventType: string,
  data: Record<string, unknown>,
  baseUrl: string,
  actorName?: string
): BuiltEmail {
  const { title, body } = renderNotification(eventType, data);
  const s = (key: string) => {
    const v = data[key];
    return v == null ? "" : String(v);
  };
  const actor = actorName || "";

  // Per-event details table (email-specific). The click destination/label is
  // shared with the in-app bell + push click via `notificationAction`.
  let details: DetailRow[] = [];

  switch (eventType) {
    case "workspace.member_added":
      details = [
        { label: "Workspace", value: s("workspaceName") },
        { label: "Added by", value: actor },
      ];
      break;
    case "workspace.member_removed":
    case "workspace.deleted":
      details = [{ label: "Workspace", value: s("workspaceName") }];
      break;
    case "workspace.agent_added":
    case "workspace.agent_removed":
      details = [
        { label: "Workspace", value: s("workspaceName") },
        { label: "Agent", value: s("agentName") },
      ];
      break;
    case "workspace.workflow_added":
    case "workspace.workflow_removed":
      details = [
        { label: "Workspace", value: s("workspaceName") },
        { label: "Workflow", value: s("workflowName") },
      ];
      break;
    case "inbox.message":
      details = [{ label: "Message", value: s("message") }];
      break;
    case "profile.updated":
      details = [
        {
          label: "Updated fields",
          value: Array.isArray(data.fields)
            ? (data.fields as string[]).join(", ")
            : s("fields"),
        },
      ];
      break;
    case "grant.received":
      details = [
        { label: "Capabilities", value: s("capabilities") },
        { label: "Agent", value: s("agentDid") || "all agents" },
        { label: "Granted by", value: actor },
      ];
      break;
    case "grant.revoked":
      details = [{ label: "Agent", value: s("agentDid") || "all agents" }];
      break;
    case "tool.approval_required":
      details = [
        { label: "Agent", value: s("agentName") },
        { label: "Tool", value: s("toolName") },
      ];
      break;
    case "user.joined":
      details = [
        { label: "Name", value: s("name") },
        { label: "Email", value: s("email") },
      ];
      break;
    case "agent.pending":
    case "agent.created":
    case "agent.deleted":
      details = [{ label: "Agent", value: s("agentName") }];
      break;
    case "policy.updated":
      details = [
        { label: "Action", value: s("action") },
        { label: "Agent", value: s("agentDid") },
        { label: "Workspace", value: s("workspaceId") },
      ];
      break;
    case "workspace.created":
      details = [
        { label: "Workspace", value: s("workspaceName") },
        { label: "Created by", value: actor },
      ];
      break;
    case "model.added":
    case "model.removed":
      details = [{ label: "Model", value: s("modelName") }];
      break;
    case "knowledge.added":
    case "knowledge.removed":
      details = [
        { label: "Knowledge", value: s("knowledgeName") },
        { label: "Workspace", value: s("workspaceName") },
      ];
      break;
    case "skill.added":
    case "skill.removed":
      details = [{ label: "Skill", value: s("skillName") }];
      break;
    case "workflow.failed":
      details = [
        { label: "Workflow", value: s("workflowName") },
        { label: "Error", value: s("error") },
      ];
      break;
    case "workflow.succeeded":
      details = [{ label: "Workflow", value: s("workflowName") }];
      break;
    default:
      details = [];
  }

  const act = notificationAction(eventType, data);
  const action: EmailAction | undefined = act
    ? { label: act.label, url: abs(baseUrl, act.path) }
    : undefined;

  const html = renderEmailLayout({
    title,
    intro: body,
    details,
    action,
    prefsUrl: abs(baseUrl, "/app/settings/notifications"),
  });

  return { subject: title, html, text: toText(body, details, action) };
}
