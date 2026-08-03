import { Bot } from "lucide-react";
import ComingSoon from "@/components/layout/ComingSoon";

/** My Agents (docs/PAGE_DESIGN.md §2.2) — connect cards for certs that grant a connect right. */
export default function MyAgentsPage() {
  return (
    <ComingSoon
      icon={Bot}
      title="My Agents"
      description="Agents you hold a connect-granting certificate for, each with a launch action into that agent kind's own connect mechanism (e.g. openclaw chat)."
    />
  );
}
