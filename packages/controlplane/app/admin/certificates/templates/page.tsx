import Link from "next/link";
import { SrtTemplateDAO, WorkspaceDAO } from "@/db";
import PageChrome from "@/components/layout/PageChrome";
import { deleteTemplateAction, assignTemplateAction } from "./actions";

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
  const [templates, workspaces, assignments] = await Promise.all([
    SrtTemplateDAO.list(),
    WorkspaceDAO.list(),
    SrtTemplateDAO.assignments(),
  ]);

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

      <h2 className="text-sm font-medium text-foreground mb-1.5">Workspace defaults</h2>
      <p className="text-xs text-foreground-500 mb-3">
        Issuing a certificate to an actor in a workspace pre-selects that workspace&apos;s template.
        The admin can edit or clear it before signing, and the certificate records whatever was
        actually submitted.
      </p>
      <ul className="space-y-2">
        {workspaces.map((workspace) => (
          <li
            key={workspace.id}
            className="flex items-center justify-between gap-4 border border-neutral-200 rounded-lg px-4 py-2"
          >
            <span className="text-sm text-foreground">{workspace.name}</span>
            <form action={assignTemplateAction} className="flex items-center gap-2">
              <input type="hidden" name="workspaceId" value={workspace.id} />
              <select
                name="templateId"
                defaultValue={assignments.get(workspace.id) ?? ""}
                className="border border-neutral-200 rounded-lg px-2 py-1 text-sm bg-background"
              >
                <option value="">No default</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="px-2 py-1 text-xs border border-neutral-200 rounded-lg hover:bg-neutral-50"
              >
                Save
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
