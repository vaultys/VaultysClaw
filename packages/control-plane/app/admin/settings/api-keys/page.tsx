"use client";

import { ApiKeysSection } from "@/components/settings/ApiKeysSection";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";

// Admin-only page: the proxy already gates /admin/* to Admin/Owner.
export default function ApiKeysSettingsPage() {
  useBreadcrumbs([{ label: "API Keys" }], []);
  useToolbar(
    { title: "API Keys", description: "Manage programmatic access keys" },
    []
  );

  return (
    <div className="p-6 w-full max-w-3xl mx-auto space-y-5">
      <ApiKeysSection />
    </div>
  );
}
