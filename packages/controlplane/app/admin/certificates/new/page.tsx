import { ActorDAO, CustomCapabilityDAO } from "@/db";
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
  const [actors, { resource, agentDid }] = await Promise.all([ActorDAO.list(), searchParams]);

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
        defaultActorDid={agentDid}
        defaultResource={resource}
        action={issueCertificateAction}
      />
    </div>
  );
}
