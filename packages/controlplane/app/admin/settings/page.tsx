import { Settings } from "lucide-react";
import PageChrome from "@/components/layout/PageChrome";
import ComingSoon from "@/components/layout/ComingSoon";

export default function SettingsPage() {
  return (
    <>
      <PageChrome toolbar={{ title: "Settings" }} breadcrumbs={[{ label: "Settings" }]} />
      <ComingSoon
        icon={Settings}
        title="Settings"
        description="The control plane's own DID (the root of trust for every certificate), org-wide trust policy defaults (fail-open/closed, staple TTL), and general config. See docs/PAGE_DESIGN.md §1.9."
      />
    </>
  );
}
