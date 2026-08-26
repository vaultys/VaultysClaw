import Link from "next/link";
import PageChrome from "@/components/layout/PageChrome";
import { createCapabilityAction } from "../actions";

/**
 * Add a custom capability to the registry (docs/CUSTOM_CAPABILITIES.md).
 *
 * A plain `<form action={...}>` + redirect — nothing here has to be revealed once and never again,
 * unlike a webhook's generated secret, so no Client Component wrapper is needed.
 */
export default function NewCapabilityPage() {
  return (
    <div className="p-6 max-w-2xl space-y-4">
      <PageChrome
        toolbar={{
          title: "Add custom capability",
          description: "An admin-defined capability your applications gate their own operations on",
        }}
        breadcrumbs={[
          { label: "Integrations", href: "/admin/integrations?tab=capabilities" },
          { label: "Add capability" },
        ]}
      />

      <div className="rounded-xl border border-neutral-200/60 bg-background-100 p-4 text-xs text-foreground-500 space-y-1.5">
        <p>
          A capability here is a <strong>name</strong>, not behaviour. The control plane governs who
          may hold it and issues it in signed certificates; what it actually permits is decided by
          the application that binds an operation to it.
        </p>
        <p>
          Removing a capability later <strong>revokes every grant of it</strong>, so pick the name
          deliberately — it cannot be renamed afterwards.
        </p>
      </div>

      <form action={createCapabilityAction} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-foreground mb-1">
            Name
          </label>
          <input
            id="name"
            name="name"
            required
            placeholder="acme:invoice.approve"
            pattern="[a-zA-Z0-9][a-zA-Z0-9-]{1,31}:[a-zA-Z0-9][a-zA-Z0-9._-]{1,63}"
            className="w-full rounded-lg border border-neutral-200/60 bg-background-100 px-3 py-2 text-sm font-mono"
          />
          <p className="mt-1 text-xs text-foreground-400">
            <code>vendor:action</code>. Lowercase; vendor 2&ndash;32 characters of{" "}
            <code>a&ndash;z 0&ndash;9 -</code>, action 2&ndash;64 of <code>a&ndash;z 0&ndash;9 . _ -</code>.
            The colon is what stops a custom name ever colliding with a built-in. Immutable once
            created.
          </p>
        </div>

        <div>
          <label htmlFor="label" className="block text-sm font-medium text-foreground mb-1">
            Label
          </label>
          <input
            id="label"
            name="label"
            required
            placeholder="Approve invoices"
            className="w-full rounded-lg border border-neutral-200/60 bg-background-100 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-foreground-400">
            Shown wherever this capability is offered or displayed.
          </p>
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-foreground mb-1">
            Description <span className="text-foreground-400 font-normal">(optional)</span>
          </label>
          <textarea
            id="description"
            name="description"
            rows={2}
            placeholder="Marks an invoice approved in the Acme ERP."
            className="w-full rounded-lg border border-neutral-200/60 bg-background-100 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-foreground-400">
            What holding this actually lets an application do &mdash; the thing an admin needs when
            deciding whether to grant it.
          </p>
        </div>

        <div>
          <label htmlFor="group" className="block text-sm font-medium text-foreground mb-1">
            Group <span className="text-foreground-400 font-normal">(optional)</span>
          </label>
          <input
            id="group"
            name="group"
            placeholder="Finance"
            className="w-full rounded-lg border border-neutral-200/60 bg-background-100 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-foreground-400">
            Groups capabilities in the issuance form, independently of vendor.
          </p>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button
            type="submit"
            className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            Add capability
          </button>
          <Link
            href="/admin/integrations?tab=capabilities"
            className="rounded-lg border border-neutral-200/60 px-3 py-2 text-sm text-foreground-500 hover:text-foreground"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
