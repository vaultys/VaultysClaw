import { ScrollText } from "lucide-react";
import PageChrome from "@/components/layout/PageChrome";
import ComingSoon from "@/components/layout/ComingSoon";

export default function AuditLogPage() {
  return (
    <>
      <PageChrome toolbar={{ title: "Audit Log" }} breadcrumbs={[{ label: "Audit Log" }]} />
      <ComingSoon
        icon={ScrollText}
        title="Audit Log"
        description="Unified, append-only IntentLog/ActivityLog view — every action, signed and timestamped, with a link into the certificate that authorized it. See docs/PAGE_DESIGN.md §1.6."
      />
    </>
  );
}
