"use client";

import { useSession } from "next-auth/react";
import { Wifi, WifiOff } from "lucide-react";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import { useDashboardData } from "@/hooks/useDashboardData";
import { DashboardAlerts } from "./DashboardAlerts";
import { DashboardHeader } from "./DashboardHeader";
import { MyQueuePanel } from "./MyQueuePanel";
import { QuickActionsPanel } from "./QuickActionsPanel";
import { RecentRunsPanel } from "./RecentRunsPanel";
import { RenewPolicyModal } from "./RenewPolicyModal";

/**
 * Fleet-wide dashboard for admins/owners. Regular members get {@link UserDashboard}
 * (routing lives in app/page.tsx). Admins always have workspace access.
 */
export function Dashboard() {
  const { data: session } = useSession();
  const d = useDashboardData(true);

  useBreadcrumbs([{ label: "Dashboard" }], []);

  useToolbar(
    {
      title: "Dashboard",
      description: "Fleet-wide overview — agents, approvals and recent activity",
      actions: [
        {
          kind: "badge",
          id: "live",
          label: d.wsConnected ? "Live" : "Connecting…",
          tone: d.wsConnected ? "success" : "warning",
          icon: d.wsConnected ? (
            <Wifi className="w-3 h-3" />
          ) : (
            <WifiOff className="w-3 h-3" />
          ),
        },
      ],
    },
    [d.wsConnected]
  );

  return (
    <div className="p-6 w-full max-w-7xl mx-auto space-y-5">
      <DashboardHeader
        name={session?.user?.name}
        onlineCount={d.onlineCount}
        total={d.total}
        queueCount={d.queueCount}
      />

      <DashboardAlerts
        wsConnected={d.wsConnected}
        isGlobalAdmin={true}
        pendingRegCount={d.pendingRegs.length}
        expiredPolicies={d.expiredPolicies}
        agents={d.agents}
        onRenew={d.openRenew}
        setupBanner={d.setupBanner}
        onDismissSetup={d.dismissSetupBanner}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <QuickActionsPanel
          isGlobalAdmin={true}
          agents={d.agents}
          total={d.total}
          inboxBadge={d.pendingApprovals.length + d.notifications.length}
          expiredPolicyCount={d.expiredPolicies.length}
        />

        <MyQueuePanel
          pendingApprovals={d.pendingApprovals}
          notifications={d.notifications}
          comment={d.comment}
          setComment={d.setComment}
          acting={d.acting}
          onAct={d.actOnApproval}
        />

        <RecentRunsPanel runs={d.recentRuns} />
      </div>

      {d.renewingPolicy && (
        <RenewPolicyModal
          policy={d.renewingPolicy}
          agents={d.agents}
          expiry={d.renewExpiry}
          setExpiry={d.setRenewExpiry}
          saving={d.renewSaving}
          onConfirm={d.confirmRenew}
          onClose={() => d.setRenewingPolicy(null)}
        />
      )}
    </div>
  );
}
