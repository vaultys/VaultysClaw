import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { CustomCapabilityDAO } from "@/db";
import PageChrome from "@/components/layout/PageChrome";
import { updateCapabilityAction, deleteCapabilityAction } from "../actions";

/**
 * A custom capability's detail page (docs/CUSTOM_CAPABILITIES.md).
 *
 * The affected-grant count is computed on every load rather than stored: it is the number that
 * makes the delete form's consequence legible, and a stale one would understate it.
 */
export default async function CapabilityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const capability = await CustomCapabilityDAO.findById(id);
  if (!capability) notFound();

  const affectedGrants = await CustomCapabilityDAO.countAffectedGrants(capability.name);

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <PageChrome
        toolbar={{ title: capability.label, description: capability.name }}
        breadcrumbs={[
          { label: "Integrations", href: "/admin/integrations?tab=capabilities" },
          { label: capability.name },
        ]}
      />

      <section className="rounded-xl border border-neutral-200/60 bg-background-100 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Registry entry</h2>
        <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
          <dt className="text-foreground-500">Name</dt>
          <dd className="font-mono text-foreground">{capability.name}</dd>
          <dt className="text-foreground-500">Vendor</dt>
          <dd className="text-foreground">{capability.vendor}</dd>
          <dt className="text-foreground-500">Action</dt>
          <dd className="text-foreground">{capability.action}</dd>
          <dt className="text-foreground-500">Active grants</dt>
          <dd className="text-foreground">
            {affectedGrants === 0 ? (
              <span className="text-foreground-400">None</span>
            ) : (
              <>
                {affectedGrants} certificate{affectedGrants === 1 ? "" : "s"}
              </>
            )}
          </dd>
          <dt className="text-foreground-500">Created</dt>
          <dd className="text-foreground-500 text-xs">
            {capability.createdAt.toISOString()} by{" "}
            <span className="font-mono">{capability.createdBy}</span>
          </dd>
        </dl>
      </section>

      <section className="rounded-xl border border-neutral-200/60 bg-background-100 p-4 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Presentation</h2>
          <p className="mt-1 text-xs text-foreground-400">
            The name is immutable &mdash; renaming would silently change which grants resolve, so it
            is expressed as delete-and-recreate, which is what it actually is.
          </p>
        </div>

        <form action={updateCapabilityAction} className="space-y-3">
          <input type="hidden" name="id" value={capability.id} />
          <div>
            <label htmlFor="label" className="block text-sm font-medium text-foreground mb-1">
              Label
            </label>
            <input
              id="label"
              name="label"
              required
              defaultValue={capability.label}
              className="w-full rounded-lg border border-neutral-200/60 bg-background-100 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-foreground mb-1">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={2}
              defaultValue={capability.description ?? ""}
              className="w-full rounded-lg border border-neutral-200/60 bg-background-100 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="group" className="block text-sm font-medium text-foreground mb-1">
              Group
            </label>
            <input
              id="group"
              name="group"
              defaultValue={capability.group ?? ""}
              className="w-full rounded-lg border border-neutral-200/60 bg-background-100 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            Save
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-warning-200 bg-warning-50/40 p-4 space-y-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-600" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">Delete this capability</h2>
            <p className="mt-1 text-xs text-foreground-500">
              This is a <strong>mass revoke</strong>, not a tidy-up.{" "}
              {affectedGrants === 0 ? (
                <>
                  No certificate currently carries it, so nothing loses authority today &mdash; but
                  any application declaring it will stop being able to hold it.
                </>
              ) : (
                <>
                  <strong>
                    {affectedGrants} active certificate{affectedGrants === 1 ? "" : "s"}
                  </strong>{" "}
                  carr{affectedGrants === 1 ? "ies" : "y"} this capability. Each will be revoked, and
                  every holder stops resolving it on its next status check even if the revocation
                  does not reach it.
                </>
              )}
            </p>
          </div>
        </div>

        <form action={deleteCapabilityAction} className="space-y-2">
          <input type="hidden" name="id" value={capability.id} />
          <label htmlFor="confirmName" className="block text-xs font-medium text-foreground">
            Type <code className="font-mono">{capability.name}</code> to confirm
          </label>
          <input
            id="confirmName"
            name="confirmName"
            required
            autoComplete="off"
            placeholder={capability.name}
            className="w-full max-w-sm rounded-lg border border-neutral-200/60 bg-background-100 px-3 py-2 text-sm font-mono"
          />
          <button
            type="submit"
            className="rounded-lg bg-danger-600 px-3 py-2 text-sm font-medium text-white hover:bg-danger-700"
          >
            Delete and revoke {affectedGrants > 0 ? `${affectedGrants} grant${affectedGrants === 1 ? "" : "s"}` : "capability"}
          </button>
        </form>
      </section>

      <Link
        href="/admin/integrations?tab=capabilities"
        className="inline-block text-xs text-primary-600 hover:underline"
      >
        &larr; Back to capabilities
      </Link>
    </div>
  );
}
