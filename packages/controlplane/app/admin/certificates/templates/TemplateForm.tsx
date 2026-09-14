"use client";

import SrtBuilder from "@/components/SrtBuilder";

/**
 * Create or edit a confinement template.
 *
 * The same builder the issuance form uses, so what an admin composes here is
 * exactly what they will see pre-filled there — a template that rendered
 * differently in the two places would be a template nobody trusted.
 */
export default function TemplateForm({
  action,
  template,
}: {
  action: (formData: FormData) => Promise<void>;
  template?: {
    id: string;
    name: string;
    description: string | null;
    settings: Record<string, unknown> | null;
    allowedDomains: string[];
  };
}) {
  return (
    <form action={action} className="space-y-6">
      {template && <input type="hidden" name="id" value={template.id} />}

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Name</label>
        <input
          type="text"
          name="name"
          required
          defaultValue={template?.name}
          placeholder="Coding agent — standard"
          className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">
          Description (optional)
        </label>
        <input
          type="text"
          name="description"
          defaultValue={template?.description ?? ""}
          placeholder="What this template is for, and who should get it"
          className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Allowed domains</label>
        <input
          type="text"
          name="allowedDomains"
          defaultValue={template?.allowedDomains.join(", ") ?? ""}
          placeholder="api.anthropic.com, github.com"
          className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
        />
        <p className="text-xs text-foreground-400 mt-1">
          Leaving this empty means <strong>no domain limit</strong>, which a supervised harness with
          confinement set to <code>require</code> cannot express — it will refuse to launch.
        </p>
      </div>

      <div>
        <h3 className="text-sm font-medium text-foreground mb-1.5">Filesystem &amp; egress</h3>
        <SrtBuilder name="srt" defaultValue={template?.settings ?? null} />
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {template ? "Save template" : "Create template"}
        </button>
        <a
          href="/admin/certificates/templates"
          className="px-4 py-2 border border-neutral-200 text-sm rounded-lg hover:bg-neutral-50"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
