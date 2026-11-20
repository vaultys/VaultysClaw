import Link from "next/link";
import { ArrowRight } from "lucide-react";
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
    allowedDomains.length > 0
      ? `${allowedDomains.length} domains allowed`
      : "no domain limit",
  ];
  if (count(net.deniedDomains) > 0)
    parts.push(`${count(net.deniedDomains)} domains denied`);
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
    <div className="p-6 max-w-4xl space-y-6">
      <PageChrome
        toolbar={{ title: "Confinement templates" }}
        breadcrumbs={[
          { label: "Certificates", href: "/admin/certificates" },
          { label: "Confinement templates" },
        ]}
      />

      <p className="text-sm leading-6 text-foreground-600">
        Reusable tier-B confinement settings for pasting into certificates at
        issuance. A template{" "}
        <span className="font-medium text-foreground">
          grants nothing and enforces nothing on its own
        </span>{" "}
        — the signed certificate is the artefact, and editing a template never
        reaches back into grants already issued.
      </p>

      <div className="space-y-3">
        <div className="flex justify-end">
          <Link
            href="/admin/certificates/templates/new"
            className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-500"
          >
            New template
          </Link>
        </div>

        {templates.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-200 px-4 py-6 text-sm text-foreground-500">
            No templates yet
          </p>
        ) : (
          <ul className="space-y-2">
            {templates.map((template) => (
              <li
                key={template.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-neutral-200/60 bg-background-100 px-4 py-3"
              >
                <div className="min-w-0">
                  <Link
                    href={`/admin/certificates/templates/${template.id}`}
                    className="text-sm font-medium text-foreground hover:underline"
                  >
                    {template.name}
                  </Link>
                  {template.description && (
                    <p className="text-xs text-foreground-500 truncate">
                      {template.description}
                    </p>
                  )}
                  <p className="text-xs text-foreground-500 font-mono mt-0.5">
                    {summarise(template.settings, template.allowedDomains)}
                  </p>
                </div>
                <form action={deleteTemplateAction}>
                  <input type="hidden" name="id" value={template.id} />
                  <button
                    type="submit"
                    className="shrink-0 text-xs text-foreground-600 transition-colors hover:text-danger-700"
                  >
                    Delete
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>

      <section>
        <h2 className="text-sm font-medium text-foreground">Workspaces</h2>
        <p className="mt-1 mb-3 text-xs leading-5 text-foreground-500">
          A workspace&apos;s templates are offered first when issuing a
          certificate to an actor in it, and the one marked{" "}
          <span className="font-medium text-foreground-700">Default</span> is
          pre-selected. The admin can edit or clear it before signing, and the
          certificate records whatever was actually submitted.
        </p>
        <ul className="space-y-3">
          {workspaces.map((workspace) => {
            const attached = (attachments.get(workspace.id) ?? [])
              .map((a) => ({
                template: byId.get(a.templateId),
                isDefault: a.isDefault,
              }))
              // A row whose template vanished can't happen (the FK cascades), but
              // the map lookup is still an Option and narrowing it here keeps the
              // component's props honest.
              .filter(
                (
                  a
                ): a is {
                  template: (typeof summaries)[number];
                  isDefault: boolean;
                } => !!a.template
              )
              .sort(
                (a, b) =>
                  Number(b.isDefault) - Number(a.isDefault) ||
                  a.template.name.localeCompare(b.template.name)
              );

            return (
              <li
                key={workspace.id}
                className="rounded-xl border border-neutral-200/60 bg-background-100 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-4 mb-2">
                  <span className="text-sm font-medium text-foreground">
                    {workspace.name}
                  </span>
                  <Link
                    href={`/admin/workspaces/${workspace.id}?tab=confinement`}
                    className="inline-flex shrink-0 items-center gap-1 text-xs text-foreground-600 transition-colors hover:text-foreground"
                  >
                    Open workspace
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
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
      </section>
    </div>
  );
}
