"use client";
import { useSession } from "next-auth/react";

export interface RoleInfo {
  did: string | null;
  isOwner: boolean;
  isAdmin: boolean;
  isGlobalAdmin: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export function useRole(): RoleInfo {
  const { data: session, status } = useSession();
  const user = session?.user as
    | { isOwner?: boolean; isAdmin?: boolean; did?: string | null }
    | undefined;
  const isOwner = Boolean(user?.isOwner);
  const isAdmin = Boolean(user?.isAdmin);
  const isGlobalAdmin = isOwner || isAdmin;
  return {
    did: user?.did ?? null,
    isOwner,
    isAdmin,
    isGlobalAdmin,
    isAuthenticated: status === "authenticated",
    isLoading: status === "loading",
  };
}
