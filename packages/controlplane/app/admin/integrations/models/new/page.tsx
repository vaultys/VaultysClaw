import PageChrome from "@/components/layout/PageChrome";
import ModelForm from "../ModelForm";
import { createModelAction } from "../../actions";

export default function NewModelPage() {
  return (
    <div className="p-6">
      <PageChrome
        toolbar={{ title: "Register model" }}
        breadcrumbs={[
          { label: "Integrations", href: "/admin/integrations?tab=models" },
          { label: "Register model" },
        ]}
      />
      <ModelForm action={createModelAction} submitLabel="Register model" />
    </div>
  );
}
