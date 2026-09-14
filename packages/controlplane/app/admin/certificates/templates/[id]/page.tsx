import { notFound } from "next/navigation";
import { SrtTemplateDAO } from "@/db";
import PageChrome from "@/components/layout/PageChrome";
import TemplateForm from "../TemplateForm";
import { updateTemplateAction } from "../actions";

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const template = await SrtTemplateDAO.findById(id);
  if (!template) notFound();

  return (
    <div className="p-6 max-w-2xl">
      <PageChrome
        toolbar={{ title: template.name }}
        breadcrumbs={[
          { label: "Certificates", href: "/admin/certificates" },
          { label: "Confinement templates", href: "/admin/certificates/templates" },
          { label: template.name },
        ]}
      />
      <TemplateForm
        action={updateTemplateAction}
        template={{
          id: template.id,
          name: template.name,
          description: template.description,
          settings: (template.settings as Record<string, unknown> | null) ?? null,
          allowedDomains: template.allowedDomains,
        }}
      />
    </div>
  );
}
