import Link from "next/link";
import { SrtTemplateDAO, WorkspaceDAO } from "@/db";
import PageChrome from "@/components/layout/PageChrome";
import WorkspaceTemplates from "@/components/WorkspaceTemplates";
import { deleteTemplateAction } from "./actions";

/** Summarise a template's settings without rendering the whole block. */
function summarise(settings: unknown, allowedDomains: string[]): string {
  const block = (settings ?? {}) as Record<string, unknown>;
  const fs = (block.filesystem ?? {}) as Record<string, unknown>;
  const net = (block.network ?? {}) as Record<string, unknown>;
  const count = (v: unknown) => (Array.isArray(v) ? v.length : 0);

  const parts = [
    `${count(fs.denyRead)} read-denied`,
    `${count(fs.denyWrite)} write-denied`,
    allowedDomains.length > 0 ? `${allowedDomains.length} domains allowed` : "no domain limit",
  ];
  if (count(net.deniedDomains) > 0) parts.push(`${count(net.deniedDomains)} domains denied`);
  return parts.join(" · ");
}

export default async function TemplatesPage() {
  const [templates, workspaces, attachments] = await Promise.all([
    SrtTemplateDAO.list(),
    WorkspaceDAO.list(),
    SrtTemplateDAO.workspaceAttachments(),
  ]);

  const summaries = templates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
  }));
  const byId = new Map(summaries.map((t) => [t.id, t]));

  return (
    <div className="p-6 max-w-4xl">
      <PageChrome
        toolbar={{ title: "Confinement templates" }}
        breadcrumbs={[
          { label: "Certificates", href: "/admin/certificates" },
          { label: "Confinement templates" },
        ]}
      />

      <p className="text-sm text-foreground-500 mb-6">
        Reusable tier-B confinement settings for pasting into certificates at issuance. A template{" "}
        <strong>grants nothing and enforces nothing on its own</strong> — the signed certificate is
        the artefact, and editing a template never reaches back into grants already issued.
      </p>

      <div className="flex justify-end mb-3">
        <Link
          href="/admin/certificates/templates/new"
          className="px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white text-sm rounded-lg"
        >
          New template
        </Link>
      </div>

      {templates.length === 0 ? (
        <p className="text-sm text-foreground-400 border border-neutral-200 rounded-lg p-6 text-center">
          No templates yet.
        </p>
      ) : (
        <ul className="space-y-2 mb-8">
          {templates.map((template) => (
            <li
              key={template.id}
              className="flex items-center justify-between gap-4 border border-neutral-200 rounded-lg px-4 py-3"
            >
              <div className="min-w-0">
                <Link
                  href={`/admin/certificates/templates/${template.id}`}
                  className="text-sm font-medium text-foreground hover:underline"
                >
                  {template.name}
                </Link>
                {template.description && (
                  <p className="text-xs text-foreground-500 truncate">{template.description}</p>
                )}
                <p className="text-xs text-foreground-400 font-mono mt-0.5">
                  {summarise(template.settings, template.allowedDomains)}
                </p>
              </div>
              <form action={deleteTemplateAction}>
                <input type="hidden" name="id" value={template.id} />
                <button
                  type="submit"
                  className="text-xs text-foreground-400 hover:text-danger-600 shrink-0"
                >
                  Delete
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <h2 className="text-sm font-medium text-foreground mb-1.5">Workspaces</h2>
      <p className="text-xs text-foreground-500 mb-3">
        A workspace&apos;s templates are offered first when issuing a certificate to an actor in it,
        and the one marked <strong>Default</strong> is pre-selected. The admin can edit or clear it
        before signing, and the certificate records whatever was actually submitted.
      </p>
      <ul className="space-y-3">
        {workspaces.map((workspace) => {
          const attached = (attachments.get(workspace.id) ?? [])
            .map((a) => ({ template: byId.get(a.templateId), isDefault: a.isDefault }))
            // A row whose template vanished can't happen (the FK cascades), but
            // the map lookup is still an Option and narrowing it here keeps the
            // component's props honest.
            .filter((a): a is { template: (typeof summaries)[number]; isDefault: boolean } => !!a.template)
            .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.template.name.localeCompare(b.template.name));

          return (
            <li key={workspace.id} className="border border-neutral-200 rounded-lg px-4 py-3">
              <div className="flex items-center justify-between gap-4 mb-2">
                <span className="text-sm font-medium text-foreground">{workspace.name}</span>
                <Link
                  href={`/admin/workspaces/${workspace.id}?tab=confinement`}
                  className="text-xs text-foreground-400 hover:text-foreground shrink-0"
                >
                  Open workspace →
                </Link>
              </div>
              <WorkspaceTemplates
                workspaceId={workspace.id}
                attached={attached}
                allTemplates={summaries}
                compact
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
