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
  const workspaceName = (data.workspaceName as string) || "a workspace";
  const who =
    (data.name as string) || (data.email as string) || "A new user";

  switch (eventType) {
    case "workspace.member_added":
      return {
        title: "Added to a workspace",
        body: `You were added to "${workspaceName}".`,
      };
    case "workspace.member_removed":
      return {
        title: "Removed from a workspace",
        body: `You were removed from "${workspaceName}".`,
      };
    case "user.joined":
      return {
        title: "New user joined",
        body: `${who} joined VaultysClaw.`,
      };
    default:
      return { title: def?.label ?? "Notification", body: def?.description ?? "" };
  }
}
