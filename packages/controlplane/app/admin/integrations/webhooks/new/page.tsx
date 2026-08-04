import PageChrome from "@/components/layout/PageChrome";
import NewWebhookForm from "../NewWebhookForm";

export default function NewWebhookPage() {
  return (
    <div className="p-6">
      <PageChrome
        toolbar={{ title: "New webhook" }}
        breadcrumbs={[
          { label: "Integrations", href: "/admin/integrations" },
          { label: "New webhook" },
        ]}
      />
      <NewWebhookForm />
    </div>
  );
}
