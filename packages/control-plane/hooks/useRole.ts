"use client";
import { useSession } from "next-auth/react";
import { isAdminRole, isOwnerRole, type UserRole } from "@/lib/roles";

export interface RoleInfo {
  did: string | null;
  role: UserRole | null;
  isOwner: boolean;
  isAdmin: boolean;
  isGlobalAdmin: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export function useRole(): RoleInfo {
  const { data: session, status } = useSession();
  const user = session?.user as
    | { role?: UserRole; did?: string | null }
    | undefined;
  const role = user?.role ?? null;
  const isOwner = isOwnerRole(role);
  const isAdmin = isAdminRole(role);
  const isGlobalAdmin = isAdmin;
  return {
    did: user?.did ?? null,
    role,
    isOwner,
    isAdmin,
    isGlobalAdmin,
    isAuthenticated: status === "authenticated",
    isLoading: status === "loading",
  };
}
