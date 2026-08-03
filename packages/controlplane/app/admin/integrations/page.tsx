import { Plug } from "lucide-react";
import PageChrome from "@/components/layout/PageChrome";
import ComingSoon from "@/components/layout/ComingSoon";

export default function IntegrationsPage() {
  return (
    <>
      <PageChrome toolbar={{ title: "Integrations" }} breadcrumbs={[{ label: "Integrations" }]} />
      <ComingSoon
        icon={Plug}
        title="Integrations"
        description="OIDC/Entra identity linking, API Keys, Webhooks, Notification Channels (Apprise-backed), and Model Registry. See docs/PAGE_DESIGN.md §1.8 and docs/REBUILD_ARCHITECTURE.md §5."
      />
    </>
  );
}
