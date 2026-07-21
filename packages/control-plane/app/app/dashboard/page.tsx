"use client";

import { useRole } from "@/hooks/useRole";
import { Dashboard } from "@/components/home/Dashboard";
import { UserDashboard } from "@/components/home/UserDashboard";

/**
 * The dashboard home. Admins/owners get the fleet-wide {@link Dashboard}; regular
 * members get the scoped {@link UserDashboard} (My Agents / My Workflows / Inbox).
 * The marketing root (`/`) redirects authenticated users here (see the proxy).
 */
export default function DashboardPage() {
  const { isGlobalAdmin, isLoading } = useRole();

  if (isLoading) return null;

  return isGlobalAdmin ? <Dashboard /> : <UserDashboard />;
}
