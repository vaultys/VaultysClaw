import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import {
  attachTemplateAction,
  detachTemplateAction,
  setDefaultTemplateAction,
} from "@/app/admin/certificates/templates/actions";

export interface TemplateSummary {
  id: string;
  name: string;
  description: string | null;
}

/**
 * A workspace's attached confinement templates.
 *
 * Rendered from two places — the workspace detail page's Confinement tab and
 * the templates page's per-workspace list — so the markup lives here rather
 * than being written twice and drifting. A Server Component: every control is
 * a plain `<form action={…}>`, no client state to hold.
 */
export default function WorkspaceTemplates({
  workspaceId,
  attached,
  allTemplates,
  compact = false,
}: {
  workspaceId: string;
  /** The workspace's templates, default first (`SrtTemplateDAO.listForWorkspace`). */
  attached: { template: TemplateSummary; isDefault: boolean }[];
  /** Every template in the org, for the "add" select. */
  allTemplates: TemplateSummary[];
  /** Tighter spacing and no descriptions, for the all-workspaces list. */
  compact?: boolean;
}) {
  const attachedIds = new Set(attached.map((a) => a.template.id));
  const available = allTemplates.filter((t) => !attachedIds.has(t.id));

  return (
    <div className="space-y-3">
      {attached.length === 0 ? (
        <p className="text-xs text-foreground-500">No template attached</p>
      ) : (
        <ul className={compact ? "space-y-1" : "space-y-2"}>
          {attached.map(({ template, isDefault }) => (
            <li
              key={template.id}
              className="flex items-center justify-between gap-3 border border-neutral-200/60 rounded-lg px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/certificates/templates/${template.id}`}
                    className="text-sm text-foreground hover:underline truncate"
                  >
                    {template.name}
                  </Link>
                  {isDefault && (
                    <Badge tone="muted">Default</Badge>
                  )}
                </div>
                {!compact && template.description && (
                  <p className="text-xs text-foreground-500 truncate">{template.description}</p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {/* Clearing the default posts an empty templateId, which is why
                    `setDefaultTemplateAction` treats "" as "no default" rather
                    than as a missing field. */}
                <form action={setDefaultTemplateAction}>
                  <input type="hidden" name="workspaceId" value={workspaceId} />
                  <input type="hidden" name="templateId" value={isDefault ? "" : template.id} />
                  <button
                    type="submit"
                    className="text-xs text-foreground-600 transition-colors hover:text-foreground"
                  >
                    {isDefault ? "Clear default" : "Make default"}
                  </button>
                </form>
                <form action={detachTemplateAction}>
                  <input type="hidden" name="workspaceId" value={workspaceId} />
                  <input type="hidden" name="templateId" value={template.id} />
                  <button
                    type="submit"
                    className="text-xs text-foreground-600 transition-colors hover:text-danger-700"
                  >
                    Remove
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      {available.length > 0 ? (
        <form action={attachTemplateAction} className="flex items-center gap-2">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <select
            name="templateId"
            defaultValue=""
            className="border border-neutral-200 rounded-lg px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
          >
            <option value="">Add a template</option>
            {available.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg border border-neutral-200 bg-background-100 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background-200"
          >
            Add
          </button>
        </form>
      ) : (
        allTemplates.length === 0 && (
          <Link
            href="/admin/certificates/templates/new"
            className="inline-flex items-center gap-1 text-xs text-primary-700 hover:underline"
          >
            Create a template
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
          </Link>
        )
      )}
    </div>
  );
}
