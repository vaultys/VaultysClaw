import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";
import { CapabilityCertificateDAO, ActorDAO, ActorLinkDAO, UserDAO, WorkspaceDAO } from "@/db";
import PageChrome from "@/components/layout/PageChrome";
import { ActorKindBadge } from "@/components/ActorKindBadge";
import ProxyConfigPanel from "@/components/proxy/ProxyConfigPanel";
import { revokeCertificateAction } from "@/app/admin/certificates/actions";
import {
  updateActorAction,
  setActorLocationFormAction,
  addActorLinkAction,
  deleteActorLinkAction,
} from "../actions";
import { decodeDidParam, encodeDidParam } from "@/lib/actor-route";
import type { CertScope } from "@vaultysclaw/policy";

const STATUS_BADGE: Record<string, string> = {
  active: "bg-success-100 text-success-700 border-success-200",
  revoked: "bg-danger-100 text-danger-700 border-danger-200",
  superseded: "bg-neutral-100 text-foreground-500 border-neutral-200",
  expired: "bg-neutral-100 text-foreground-500 border-neutral-200",
};

/**
 * Actor detail (docs/PAGE_DESIGN.md §1.3's natural companion to the
 * Certificates detail page): everything known about one DID-holder, an edit
 * form for the fields an admin can actually change (name, workspace, and —
 * humans only — email; `did`/`kind`/`publicKey` are captured once at
 * registration and never change), and every certificate issued to it.
 */
export default async function ActorDetailPage({
  params,
}: {
  params: Promise<{ did: string }>;
}) {
  const { did: didParam } = await params;
  const did = decodeDidParam(didParam);
  const actor = await ActorDAO.findByDid(did);
  if (!actor) notFound();

  const [certs, workspaces, human, links, allActors] = await Promise.all([
    CapabilityCertificateDAO.list({ agentDid: did }),
    WorkspaceDAO.list(),
    actor.kind === "human" ? UserDAO.findByDid(did) : Promise.resolve(null),
    ActorLinkDAO.listForActor(did),
    ActorDAO.list(),
  ]);

  const activeCount = certs.filter((c) => c.status === "active").length;
  const hasLocation = actor.locationLat !== null && actor.locationLon !== null;
  const linkableActors = allActors.filter((a) => a.did !== did);
  const owner = actor.ownerDid ? allActors.find((a) => a.did === actor.ownerDid) : null;
  const ownedActors = allActors.filter((a) => a.ownerDid === did);

  return (
    <div className="p-6 max-w-3xl space-y-8">
      <PageChrome
        toolbar={{ title: actor.name }}
        breadcrumbs={[
          { label: "Actors", href: "/admin/actors" },
          { label: actor.name },
        ]}
      />

      <Link
        href="/admin/actors"
        className="inline-flex items-center gap-1.5 text-sm text-foreground-500 hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Actors
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{actor.name}</h1>
          <p className="text-xs text-foreground-500 font-mono mt-0.5">{actor.did}</p>
        </div>
        <div className="shrink-0">
          <ActorKindBadge kind={actor.kind} />
        </div>
      </div>

      <section className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-xs text-foreground-500 uppercase font-medium mb-1">Registered</div>
          <div>{actor.registeredAt.toISOString()}</div>
        </div>
        <div>
          <div className="text-xs text-foreground-500 uppercase font-medium mb-1">Last seen</div>
          <div>{actor.lastSeen.toISOString()}</div>
        </div>
        <div>
          <div className="text-xs text-foreground-500 uppercase font-medium mb-1">
            Active certificates
          </div>
          <div>{activeCount}</div>
        </div>
        <div>
          <div className="text-xs text-foreground-500 uppercase font-medium mb-1">Public key</div>
          <div className="text-xs font-mono break-all text-foreground-500">
            {actor.publicKey ?? "—"}
          </div>
        </div>
      </section>

      {/* The kind extension (docs/REBUILD_ARCHITECTURE.md §4.3). Placed high on the
          page, above Location and the certificate list: for a proxy this is the
          section that decides whether traffic is refused, so it should not sit
          below optional metadata. */}
      {actor.kind === "proxy" && <ProxyConfigPanel actor={actor} />}

      <section className="space-y-3 border border-neutral-200/60 rounded-xl bg-background-100 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground-700 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-foreground-400" />
            Location
          </h2>
          <Link href="/admin/map" className="text-xs text-primary-600 hover:underline">
            View on map →
          </Link>
        </div>
        {hasLocation ? (
          <p className="text-sm text-foreground">
            {actor.locationLabel ?? "—"}{" "}
            <span className="text-xs font-mono text-foreground-500">
              ({actor.locationLat!.toFixed(4)}, {actor.locationLon!.toFixed(4)})
            </span>
          </p>
        ) : (
          <p className="text-sm text-foreground-400">Not located.</p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <form action={setActorLocationFormAction} className="flex gap-2">
            <input type="hidden" name="did" value={actor.did} />
            <input type="hidden" name="mode" value="city" />
            <input
              type="text"
              name="city"
              placeholder="Look up by city, e.g. Paris, France"
              className="flex-1 border border-neutral-200 rounded-lg px-3 py-1.5 text-sm bg-background"
            />
            <button
              type="submit"
              className="px-3 py-1.5 border border-neutral-200 text-foreground text-sm font-medium rounded-lg hover:bg-background-200 transition-colors shrink-0"
            >
              Look up
            </button>
          </form>
          <form action={setActorLocationFormAction} className="flex gap-2">
            <input type="hidden" name="did" value={actor.did} />
            <input type="hidden" name="mode" value="coords" />
            <input
              type="number"
              step="any"
              name="lat"
              defaultValue={actor.locationLat ?? ""}
              placeholder="Latitude"
              className="w-24 border border-neutral-200 rounded-lg px-3 py-1.5 text-sm bg-background"
            />
            <input
              type="number"
              step="any"
              name="lon"
              defaultValue={actor.locationLon ?? ""}
              placeholder="Longitude"
              className="w-24 border border-neutral-200 rounded-lg px-3 py-1.5 text-sm bg-background"
            />
            <input
              type="text"
              name="label"
              defaultValue={actor.locationLabel ?? ""}
              placeholder="Label (optional)"
              className="flex-1 border border-neutral-200 rounded-lg px-3 py-1.5 text-sm bg-background"
            />
            <button
              type="submit"
              className="px-3 py-1.5 border border-neutral-200 text-foreground text-sm font-medium rounded-lg hover:bg-background-200 transition-colors shrink-0"
            >
              Set
            </button>
          </form>
        </div>
        {hasLocation && (
          <form action={setActorLocationFormAction}>
            <input type="hidden" name="did" value={actor.did} />
            <input type="hidden" name="mode" value="clear" />
            <button type="submit" className="text-xs text-danger-600 hover:underline">
              Clear location
            </button>
          </form>
        )}
      </section>

      <section className="space-y-4 border border-neutral-200/60 rounded-xl bg-background-100 p-4">
        <h2 className="text-sm font-semibold text-foreground-700">Edit</h2>
        <form action={updateActorAction} className="space-y-4">
          <input type="hidden" name="did" value={actor.did} />
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Name</label>
            <input
              type="text"
              name="name"
              defaultValue={actor.name}
              required
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Workspace</label>
            <select
              name="workspaceId"
              defaultValue={actor.workspaceId ?? ""}
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
            >
              <option value="">No workspace</option>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          {actor.kind === "human" && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
              <input
                type="email"
                name="email"
                defaultValue={human?.humanProfile?.email ?? ""}
                placeholder="Used for email notifications — optional"
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
              />
            </div>
          )}
          {actor.kind !== "human" && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Owned by</label>
              <select
                name="ownerDid"
                defaultValue={actor.ownerDid ?? ""}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
              >
                <option value="">No owner</option>
                {linkableActors.map((a) => (
                  <option key={a.did} value={a.did}>
                    {a.name} ({a.kind})
                  </option>
                ))}
              </select>
              <p className="text-xs text-foreground-400 mt-1">
                The actor this one belongs to / acts for (e.g. a device belonging to a human or an
                agent) — descriptive only today, not yet enforced by any certificate.
              </p>
            </div>
          )}
          <button
            type="submit"
            className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Save changes
          </button>
        </form>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground-700">
            Certificates ({certs.length})
          </h2>
          <Link
            href={`/admin/certificates/new`}
            className="text-xs text-primary-600 hover:underline"
          >
            Issue certificate →
          </Link>
        </div>
        <div className="overflow-x-auto border border-neutral-200/60 rounded-xl">
          <table className="w-full text-sm bg-background-100">
            <thead className="bg-background-200/40 text-left text-xs text-foreground-500 uppercase">
              <tr>
                <th className="px-4 py-2 font-medium">Capabilities</th>
                <th className="px-4 py-2 font-medium">Scope</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Expires</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {certs.map((cert) => {
                const scope = cert.scope as CertScope | null;
                return (
                  <tr key={cert.id} className="border-t border-neutral-200/60 align-top">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/admin/certificates/${cert.id}`}
                        className="text-foreground-700 hover:text-primary-600 hover:underline"
                      >
                        {(cert.capabilities as string[]).join(", ") || "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-foreground-500">
                      {scope?.resource ?? scope?.resourcePattern ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_BADGE[cert.status] ?? STATUS_BADGE.expired}`}
                        title={cert.revokedReason ?? undefined}
                      >
                        {cert.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {cert.expiresAt ? (
                        <span className="text-foreground-500">
                          {cert.expiresAt.toISOString().slice(0, 10)}
                        </span>
                      ) : (
                        <span className="text-warning-600 font-medium">Never</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {cert.status === "active" && (
                        <form action={revokeCertificateAction} className="flex items-center gap-1.5">
                          <input type="hidden" name="certId" value={cert.id} />
                          <input
                            type="text"
                            name="reason"
                            placeholder="Reason"
                            className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-24 bg-background"
                          />
                          <button
                            type="submit"
                            className="text-xs px-2 py-1 border border-danger-200 text-danger-600 rounded hover:bg-danger-50 transition-colors"
                          >
                            Revoke
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
              {certs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-foreground-400">
                    No certificates issued to this Actor yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground-700">Ownership</h2>
        <p className="text-xs text-foreground-400">
          Which actor this one belongs to / acts for, and which actors belong to it — see the
          &quot;Owned by&quot; field in Edit above. Descriptive only today, not yet enforced by any
          certificate.
        </p>
        <div className="space-y-2">
          {owner && (
            <div className="border border-neutral-200/60 rounded-lg bg-background-100 px-3 py-2 text-sm">
              <span className="text-foreground-500">Belongs to</span>{" "}
              <Link
                href={`/admin/actors/${encodeDidParam(owner.did)}`}
                className="text-foreground hover:text-primary-600 hover:underline"
              >
                {owner.name}
              </Link>
            </div>
          )}
          {ownedActors.map((a) => (
            <div
              key={a.did}
              className="border border-neutral-200/60 rounded-lg bg-background-100 px-3 py-2 text-sm"
            >
              <span className="text-foreground-500">Owns</span>{" "}
              <Link
                href={`/admin/actors/${encodeDidParam(a.did)}`}
                className="text-foreground hover:text-primary-600 hover:underline"
              >
                {a.name}
              </Link>
            </div>
          ))}
          {!owner && ownedActors.length === 0 && (
            <p className="text-sm text-foreground-400">No ownership relationships recorded yet.</p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground-700">Relationships</h2>
        <p className="text-xs text-foreground-400">
          A directed, freely-labeled link to any other Actor — &quot;reports to&quot;,
          &quot;belongs to&quot;, &quot;manages&quot;, or anything else worth recording.
        </p>
        <div className="space-y-2">
          {links.from.map((link) => (
            <div
              key={link.id}
              className="flex items-center justify-between border border-neutral-200/60 rounded-lg bg-background-100 px-3 py-2 text-sm"
            >
              <span>
                <span className="text-foreground-500">{link.label}</span>{" "}
                <Link
                  href={`/admin/actors/${encodeDidParam(link.to.did)}`}
                  className="text-foreground hover:text-primary-600 hover:underline"
                >
                  {link.to.name}
                </Link>
              </span>
              <form action={deleteActorLinkAction}>
                <input type="hidden" name="id" value={link.id} />
                <input type="hidden" name="returnToDid" value={did} />
                <button type="submit" className="text-xs text-danger-600 hover:underline">
                  Remove
                </button>
              </form>
            </div>
          ))}
          {links.to.map((link) => (
            <div
              key={link.id}
              className="flex items-center justify-between border border-neutral-200/60 rounded-lg bg-background-100 px-3 py-2 text-sm"
            >
              <span>
                <Link
                  href={`/admin/actors/${encodeDidParam(link.from.did)}`}
                  className="text-foreground hover:text-primary-600 hover:underline"
                >
                  {link.from.name}
                </Link>{" "}
                <span className="text-foreground-500">{link.label}</span>{" "}
                <span className="text-foreground-400">this actor</span>
              </span>
              <form action={deleteActorLinkAction}>
                <input type="hidden" name="id" value={link.id} />
                <input type="hidden" name="returnToDid" value={did} />
                <button type="submit" className="text-xs text-danger-600 hover:underline">
                  Remove
                </button>
              </form>
            </div>
          ))}
          {links.from.length === 0 && links.to.length === 0 && (
            <p className="text-sm text-foreground-400">No relationships recorded yet.</p>
          )}
        </div>
        {linkableActors.length > 0 && (
          <form
            action={addActorLinkAction}
            className="flex flex-wrap items-end gap-2 border border-neutral-200/60 rounded-xl bg-background-100 p-4"
          >
            <input type="hidden" name="fromDid" value={did} />
            <div>
              <label className="block text-xs text-foreground-500 mb-1">Label</label>
              <input
                type="text"
                name="label"
                placeholder="e.g. belongs to"
                required
                list="actor-link-label-presets"
                className="w-40 border border-neutral-200 rounded-lg px-3 py-1.5 text-sm bg-background"
              />
              <datalist id="actor-link-label-presets">
                <option value="belongs to" />
                <option value="reports to" />
                <option value="manages" />
                <option value="owns" />
              </datalist>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-foreground-500 mb-1">Target Actor</label>
              <select
                name="toDid"
                required
                className="w-full border border-neutral-200 rounded-lg px-3 py-1.5 text-sm bg-background"
              >
                {linkableActors.map((a) => (
                  <option key={a.did} value={a.did}>
                    {a.name} ({a.kind})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Add link
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
