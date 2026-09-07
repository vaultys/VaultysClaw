import { notFound } from "next/navigation";
import Link from "next/link";
import { SsoConnectionDAO, SsoIdentityDAO } from "@/db";
import PageChrome from "@/components/layout/PageChrome";
import { callbackUrlFor } from "@/lib/sso-config";
import { encodeDidParam } from "@/lib/actor-route";
import SsoConnectionForm from "../SsoConnectionForm";
import ConnectionHealth from "../ConnectionHealth";
import { updateSsoConnectionAction, deleteSsoConnectionAction } from "../actions";

export default async function SsoConnectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const connection = await SsoConnectionDAO.findById(id);
  if (!connection) notFound();

  const identities = await SsoIdentityDAO.listForConnection(id);
  const bound = identities.filter((i) => i.did);

  return (
    <div className="p-6 max-w-2xl space-y-8">
      <PageChrome
        toolbar={{
          title: connection.name,
          description: connection.kind === "entra" ? "Microsoft Entra ID" : "Generic OIDC",
        }}
        breadcrumbs={[
          { label: "Integrations", href: "/admin/integrations?tab=identity" },
          { label: connection.name },
        ]}
      />

      <div className="space-y-2">
        <ConnectionHealth connection={connection} />
      </div>

      <SsoConnectionForm
        action={updateSsoConnectionAction}
        connection={connection}
        callbackUrl={callbackUrlFor(connection)}
        submitLabel="Save changes"
      />

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Linked identities</h2>
          <p className="text-xs text-foreground-400 mt-0.5">
            People who have signed in through this provider. An identity is only usable once it has
            been bound to a VaultysId — signing in is what creates the binding link, and completing
            it is what creates the Actor.
          </p>
        </div>

        <div className="overflow-x-auto border border-neutral-200/60 rounded-xl">
          <table className="w-full text-sm bg-background-100">
            <thead className="bg-background-200/40 text-left text-xs text-foreground-500 uppercase">
              <tr>
                <th className="px-4 py-2 font-medium">Identity</th>
                <th className="px-4 py-2 font-medium">Bound to</th>
                <th className="px-4 py-2 font-medium">Last login</th>
              </tr>
            </thead>
            <tbody>
              {identities.map((identity) => (
                <tr key={identity.id} className="border-t border-neutral-200/60">
                  <td className="px-4 py-2.5">
                    <div className="text-foreground">{identity.name ?? "—"}</div>
                    {identity.email && (
                      <div className="text-xs text-foreground-400">{identity.email}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {identity.did ? (
                      <Link
                        href={`/admin/actors/${encodeDidParam(identity.did)}`}
                        className="text-xs font-mono text-primary-600 hover:underline"
                      >
                        {identity.did.slice(0, 24)}…
                      </Link>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full border bg-warning-100 text-warning-700 border-warning-200">
                        Not bound
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-foreground-500 text-xs">
                    {identity.lastLoginAt ? identity.lastLoginAt.toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
              {identities.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-foreground-400">
                    Nobody has signed in through this provider yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2 pt-2 border-t border-neutral-200/60">
        <h2 className="text-sm font-semibold text-danger-600">Delete this provider</h2>
        <p className="text-xs text-foreground-400">
          Removes the connection and its {identities.length} linked{" "}
          {identities.length === 1 ? "identity" : "identities"}
          {bound.length > 0 && (
            <>
              {" "}
              — including {bound.length} already bound to an Actor. Those people keep their DIDs,
              certificates and wallet login; they only lose this way in
            </>
          )}
          .
        </p>
        <form action={deleteSsoConnectionAction}>
          <input type="hidden" name="id" value={connection.id} />
          <button
            type="submit"
            className="text-xs px-3 py-1.5 border border-danger-200 text-danger-600 rounded-lg hover:bg-danger-50 transition-colors"
          >
            Delete provider
          </button>
        </form>
      </section>
    </div>
  );
}
