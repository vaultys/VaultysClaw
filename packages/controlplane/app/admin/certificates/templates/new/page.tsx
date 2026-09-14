import PageChrome from "@/components/layout/PageChrome";
import TemplateForm from "../TemplateForm";
import { createTemplateAction } from "../actions";

export default function NewTemplatePage() {
  return (
    <div className="p-6 max-w-2xl">
      <PageChrome
        toolbar={{ title: "New confinement template" }}
        breadcrumbs={[
          { label: "Certificates", href: "/admin/certificates" },
          { label: "Confinement templates", href: "/admin/certificates/templates" },
          { label: "New" },
        ]}
      />
      <TemplateForm action={createTemplateAction} />
    </div>
  );
}
