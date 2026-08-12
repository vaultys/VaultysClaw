import PageChrome from "@/components/layout/PageChrome";
import SsoConnectionForm from "../SsoConnectionForm";
import { createSsoConnectionAction } from "../actions";

export default function NewSsoConnectionPage() {
  return (
    <div className="p-6">
      <PageChrome
        toolbar={{ title: "Add identity provider" }}
        breadcrumbs={[
          { label: "Integrations", href: "/admin/integrations?tab=identity" },
          { label: "Add identity provider" },
        ]}
      />
      {/* No redirect URI shown yet — it embeds the connection id, which doesn't
          exist until this form is submitted. The edit page shows it. */}
      <SsoConnectionForm action={createSsoConnectionAction} submitLabel="Add provider" />
    </div>
  );
}
