import { Globe2 } from "lucide-react";
import PageChrome from "@/components/layout/PageChrome";
import ComingSoon from "@/components/layout/ComingSoon";

export default function WorkspacesPage() {
  return (
    <>
      <PageChrome toolbar={{ title: "Workspaces" }} breadcrumbs={[{ label: "Workspaces" }]} />
      <ComingSoon
        icon={Globe2}
        title="Workspaces"
        description="Workspace-scoped principals, budgets, and model access — plus workspace-level admin rights expressed as scoped certificates (CertScope.resource = workspace:<id>), not a separate role table. See docs/PAGE_DESIGN.md §1.7."
      />
    </>
  );
}
