import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth-config";
import { hasCapability } from "@/lib/access-control";
import AppShell from "@/components/layout/AppShell";
import SignOutButton from "@/components/SignOutButton";
import { ActorDAO, CapabilityCertificateDAO, SettingsDAO, WorkspaceDAO } from "@/db";
import { encodeDidParam } from "@/lib/actor-route";
import { DEFAULT_ORG_NAME, SETTINGS_KEYS } from "@/lib/org-settings";
import type { AdminCommandItem } from "@/components/layout/AdminCommandPalette";

/**
 * The admin console's capability gate (docs/PAGE_DESIGN.md §0): a route
 * loads only if the logged-in DID holds a current `admin_console_access`
 * certificate. Not a role check — a ledger lookup, same mechanism as
 * anything else in the trust model.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.did) redirect("/login");

  const authorized = await hasCapability(session.user.did, "admin_console_access");
  if (!authorized) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-md text-center space-y-4">
          <div className="space-y-2">
            <h1 className="text-lg font-semibold text-foreground">Access denied</h1>
            <p className="text-sm text-foreground-500">
              Your account does not hold an <code>admin_console_access</code> certificate.
            </p>
          </div>
          <div className="flex items-center justify-center gap-4">
            <Link href="/" className="text-sm text-foreground-500 hover:text-foreground transition-colors">
              Home
            </Link>
            <SignOutButton />
          </div>
        </div>
      </main>
    );
  }

  const [orgNameSetting, actors, certificates, workspaces] = await Promise.all([
    SettingsDAO.get(SETTINGS_KEYS.orgName),
    ActorDAO.list(),
    CapabilityCertificateDAO.list(),
    WorkspaceDAO.list(),
  ]);
  const orgName = orgNameSetting ?? DEFAULT_ORG_NAME;
  const actorByDid = new Map(actors.map((actor) => [actor.did, actor]));

  const commandItems: AdminCommandItem[] = [
    { id: "route-overview", label: "Overview", subtitle: "Trust posture and setup", href: "/admin", group: "Navigate" },
    { id: "route-actors", label: "Actors", subtitle: "People, agents, devices, and approvals", href: "/admin/actors", group: "Navigate" },
    { id: "route-sensors", label: "Sensors", subtitle: "Fleet and workload telemetry", href: "/admin/sensors", group: "Navigate" },
    { id: "route-map", label: "Map", subtitle: "Actor and sensor locations", href: "/admin/map", group: "Navigate" },
    { id: "route-certificates", label: "Certificates", subtitle: "Capability grants and revocation ledger", href: "/admin/certificates", group: "Navigate" },
    { id: "route-audit", label: "Audit Log", subtitle: "Signed events and operator history", href: "/admin/audit", group: "Navigate" },
    { id: "route-workspaces", label: "Workspaces", subtitle: "Scopes for teams and environments", href: "/admin/workspaces", group: "Navigate" },
    { id: "route-integrations", label: "Integrations", subtitle: "Webhooks, channels, and capabilities", href: "/admin/integrations", group: "Navigate" },
    { id: "route-settings", label: "Settings", subtitle: "Organization defaults and policies", href: "/admin/settings", group: "Navigate" },
    ...actors.map((actor): AdminCommandItem => ({
      id: `actor-${actor.did}`,
      label: actor.name,
      subtitle: `${actor.kind} - ${actor.did}`,
      href: `/admin/actors/${encodeDidParam(actor.did)}`,
      group: actor.kind === "sensor" ? "Sensors" : "Actors",
      keywords: [actor.kind, actor.did],
    })),
    ...certificates.map((cert): AdminCommandItem => {
      const actor = actorByDid.get(cert.agentDid);
      return {
        id: `certificate-${cert.id}`,
        label: actor?.name ?? cert.agentDid,
        subtitle: `${cert.status} certificate - ${(cert.capabilities as string[]).join(", ") || "no capabilities"}`,
        href: `/admin/certificates/${cert.id}`,
        group: "Certificates",
        keywords: [cert.id, cert.agentDid, cert.status, ...(cert.capabilities as string[])],
      };
    }),
    ...workspaces.map((workspace): AdminCommandItem => ({
      id: `workspace-${workspace.id}`,
      label: workspace.name,
      subtitle: workspace.description ?? workspace.slug,
      href: `/admin/workspaces/${workspace.id}`,
      group: "Workspaces",
      keywords: [workspace.id, workspace.slug],
    })),
  ];

  return <AppShell orgName={orgName} commandItems={commandItems}>{children}</AppShell>;
}
