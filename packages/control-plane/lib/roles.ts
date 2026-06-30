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
