/**
 * User access-control roles.
 *
 * A single `role` field on the User model is the source of truth. There are
 * exactly three values; any legacy value (lowercase, `manager`, `cto`, …) is
 * folded onto `"Member"` by {@link normalizeRole}.
 */
export const USER_ROLES = ["Owner", "Admin", "Member"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Roles selectable for unclaimed users (no Owner). */
export const ASSIGNABLE_ROLES = ["Member", "Admin"] as const;

/** Normalise any legacy value (lowercase, manager, cto…) to the current enum. */
export function normalizeRole(value: string | null | undefined): UserRole {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "owner") return "Owner";
  if (v === "admin") return "Admin";
  return "Member";
}

/** True when the role grants owner privileges. */
export const isOwnerRole = (role: string | null | undefined): boolean =>
  normalizeRole(role) === "Owner";

/** True when the role grants global-admin privileges (an Owner is also admin). */
export const isAdminRole = (role: string | null | undefined): boolean => {
  const r = normalizeRole(role);
  return r === "Owner" || r === "Admin";
};

/**
 * Per-workspace membership roles (stored on `UserWorkspace.role`). Same three
 * values as the global user roles but scoped to a single workspace:
 *   - Owner  — the workspace creator (or the user themselves for a personal
 *              workspace); can do everything, including transferring ownership.
 *   - Admin  — can modify / add elements in the workspace.
 *   - Member — can use existing elements without modifying them.
 */
export const WORKSPACE_ROLES = ["Owner", "Admin", "Member"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

/** Roles that can be assigned when adding/updating a member (Owner is set via creation/transfer only). */
export const ASSIGNABLE_WORKSPACE_ROLES = ["Admin", "Member"] as const;
export type AssignableWorkspaceRole = (typeof ASSIGNABLE_WORKSPACE_ROLES)[number];

/** Normalise any legacy value to the current workspace-role enum. */
export function normalizeWorkspaceRole(
  value: string | null | undefined
): WorkspaceRole {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "owner") return "Owner";
  if (v === "admin") return "Admin";
  return "Member";
}

/** True when the workspace role grants admin privileges (an Owner is also admin). */
export const isWorkspaceAdminRole = (
  role: string | null | undefined
): boolean => {
  const r = normalizeWorkspaceRole(role);
  return r === "Owner" || r === "Admin";
};

/** True when the workspace role is Owner. */
export const isWorkspaceOwnerRole = (
  role: string | null | undefined
): boolean => normalizeWorkspaceRole(role) === "Owner";
