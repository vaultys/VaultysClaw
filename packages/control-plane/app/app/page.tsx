"use client";

import { Dashboard } from "@/components/home/Dashboard";

/**
 * Member home. Reached directly, or when the proxy redirects a non-admin away
 * from an admin-only area. Only authenticated users get here (the proxy sends
 * anonymous visitors to /login), so we render the dashboard unconditionally.
 */
export default function AppHome() {
  return <Dashboard />;
}
