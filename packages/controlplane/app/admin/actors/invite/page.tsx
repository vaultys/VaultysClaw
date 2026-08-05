import { WorkspaceDAO } from "@/db";
import PageChrome from "@/components/layout/PageChrome";
import InviteHumanForm from "./InviteHumanForm";

/**
 * Invite a human directly (packages/controlplane/CLAUDE.md "Human onboarding via invite") —
 * generates a single-use link to /invite/[token], which walks the invitee through the same
 * VaultysId pairing as /login, scoped to this one invitation.
 */
export default async function InviteHumanPage() {
  const workspaces = await WorkspaceDAO.list();

  return (
    <div className="p-6 max-w-2xl">
      <PageChrome
        toolbar={{ title: "Invite a human" }}
        breadcrumbs={[
          { label: "Actors", href: "/admin/actors" },
          { label: "Invite a human" },
        ]}
      />
      <InviteHumanForm workspaces={workspaces.map((w) => ({ id: w.id, name: w.name }))} />
    </div>
  );
}
