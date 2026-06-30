"use client";

import { useSession } from "next-auth/react";
import { useRole } from "@/hooks/useRole";
import { useDashboardData } from "@/hooks/useDashboardData";
import { DashboardAlerts } from "./DashboardAlerts";
import { DashboardHeader } from "./DashboardHeader";
import { MyQueuePanel } from "./MyQueuePanel";
import { NoRealmScreen } from "./NoRealmScreen";
import { QuickActionsPanel } from "./QuickActionsPanel";
import { RecentRunsPanel } from "./RecentRunsPanel";
import { RenewPolicyModal } from "./RenewPolicyModal";

export function Dashboard() {
  const { data: session } = useSession();
  const { isGlobalAdmin } = useRole();
  const d = useDashboardData(isGlobalAdmin);

  // Non-admin with no realm membership → contact screen
  if (!isGlobalAdmin && d.userRealmCount === 0) {
    return <NoRealmScreen />;
  }

  return (
    <div className="p-6 w-full max-w-7xl mx-auto space-y-5">
      <DashboardHeader
        name={session?.user?.name}
        wsConnected={d.wsConnected}
        onlineCount={d.onlineCount}
        total={d.total}
        queueCount={d.queueCount}
      />

      <DashboardAlerts
        wsConnected={d.wsConnected}
        isGlobalAdmin={isGlobalAdmin}
        pendingRegCount={d.pendingRegs.length}
        expiredPolicies={d.expiredPolicies}
        agents={d.agents}
        onRenew={d.openRenew}
        setupBanner={d.setupBanner}
        onDismissSetup={d.dismissSetupBanner}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <QuickActionsPanel
          isGlobalAdmin={isGlobalAdmin}
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
