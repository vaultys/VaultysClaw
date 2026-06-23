import { getInitials } from "@vaultysclaw/shared";
import type { UserListItem } from "@/lib/contracts";

/**
 * Avatar initials for a user — prefers the name (via the shared `getInitials`),
 * then falls back to the tail of the DID or email.
 */
export function userInitials(
  user: Pick<UserListItem, "name" | "did" | "email">
): string {
  if (user.name) return getInitials(user.name);
  if (user.did) return user.did.slice(-2).toUpperCase();
  if (user.email) return user.email.slice(0, 2).toUpperCase();
  return "??";
}
