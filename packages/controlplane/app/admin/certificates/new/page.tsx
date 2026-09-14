import { ActorDAO, CustomCapabilityDAO, SrtTemplateDAO } from "@/db";
import PageChrome from "@/components/layout/PageChrome";
import { issueCertificateAction } from "../actions";
import IssueCertificateForm from "./IssueCertificateForm";

/** Issue certificate flow (docs/PAGE_DESIGN.md §1.5). `resource`/`agentDid` query params let
 *  another page (e.g. a workspace's Access tab) deep-link here with the scope pre-filled. */
export default async function NewCertificatePage({
  searchParams,
}: {
  searchParams: Promise<{ resource?: string; agentDid?: string }>;
}) {
  const customCapabilities = await CustomCapabilityDAO.list();
  const [actors, templates, assignments, attachments, { resource, agentDid }] = await Promise.all([
    ActorDAO.list(),
    SrtTemplateDAO.list(),
    SrtTemplateDAO.assignments(),
    SrtTemplateDAO.workspaceAttachments(),
    searchParams,
  ]);

  // Resolved here rather than in the client component, which has no workspace
  // vocabulary and should not grow one just to look up a default.
  const defaultTemplateByActor: Record<string, string> = {};
  const workspaceTemplatesByActor: Record<string, string[]> = {};
  for (const actor of actors) {
    if (!actor.workspaceId) continue;
    const templateId = assignments.get(actor.workspaceId);
    if (templateId) defaultTemplateByActor[actor.did] = templateId;
    const attached = attachments.get(actor.workspaceId);
    if (attached?.length) workspaceTemplatesByActor[actor.did] = attached.map((a) => a.templateId);
  }

  return (
    <div className="p-6 max-w-2xl">
      <PageChrome
        toolbar={{ title: "Issue certificate" }}
        breadcrumbs={[
          { label: "Certificates", href: "/admin/certificates" },
          { label: "Issue certificate" },
        ]}
      />

      <IssueCertificateForm
        actors={actors.map((actor) => ({
          did: actor.did,
          name: actor.name,
          kind: actor.kind,
        }))}
        customCapabilities={customCapabilities.map((cap) => ({
          id: cap.id,
          name: cap.name,
          label: cap.label,
          description: cap.description,
          group: cap.group,
          vendor: cap.vendor,
        }))}
        templates={templates.map((template) => ({
          id: template.id,
          name: template.name,
          description: template.description,
          settings: (template.settings as Record<string, unknown> | null) ?? null,
          allowedDomains: template.allowedDomains,
        }))}
        defaultTemplateByActor={defaultTemplateByActor}
        workspaceTemplatesByActor={workspaceTemplatesByActor}
        defaultActorDid={agentDid}
        defaultResource={resource}
        action={issueCertificateAction}
      />
    </div>
  );
}
