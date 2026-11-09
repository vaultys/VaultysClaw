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
          className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
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
          className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Allowed domains</label>
        <input
          type="text"
          name="allowedDomains"
          defaultValue={template?.allowedDomains.join(", ") ?? ""}
          placeholder="api.anthropic.com, github.com"
          className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
        />
        <p className="text-xs leading-5 text-foreground-500 mt-1">
          Leaving this empty means <span className="font-medium text-foreground-700">no domain limit</span>, which a supervised harness with
          confinement set to <code className="font-mono">require</code> cannot express — it will refuse to launch.
        </p>
      </div>

      <div>
        <h3 className="text-sm font-medium text-foreground mb-1.5">Filesystem &amp; egress</h3>
        <SrtBuilder name="srt" defaultValue={template?.settings ?? null} />
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-500"
        >
          {template ? "Save template" : "Create template"}
        </button>
        <a
          href="/admin/certificates/templates"
          className="rounded-lg border border-neutral-200 bg-background-100 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background-200"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
