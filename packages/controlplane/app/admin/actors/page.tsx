import Link from "next/link";
import { ActorDAO, PendingRegistrationDAO } from "@/db";
import PageChrome from "@/components/layout/PageChrome";
import { ActorKindBadge } from "@/components/ActorKindBadge";
import { encodeDidParam } from "@/lib/actor-route";
import { categoryForKind } from "@/lib/actor-kinds";
import { AGENT_CAPABILITIES, SENSOR_CAPABILITIES } from "@/lib/capabilities";
import { approveRegistrationAction, denyRegistrationAction } from "./actions";

/**
 * Actors (docs/PAGE_DESIGN.md §1.3) — unified list + the onboarding
 * approval flow (docs/REBUILD_ARCHITECTURE.md §4.2): approving a pending
 * registration *is* the first capability_request/grant round-trip, presented
 * as one action instead of two steps.
 */
export default async function ActorsPage() {
  const [actors, pending, awaitingDelivery] = await Promise.all([
    ActorDAO.list(),
    PendingRegistrationDAO.listPending(),
    PendingRegistrationDAO.listApprovedUndelivered(),
  ]);

  return (
    <div className="p-6 space-y-10">
      <PageChrome
        toolbar={{
          title: "Actors",
          description: `${actors.length} registered · ${pending.length} pending approval${
            awaitingDelivery.length > 0 ? ` · ${awaitingDelivery.length} awaiting delivery` : ""
          }`,
        }}
        breadcrumbs={[{ label: "Actors" }]}
      />

      <section>
        <h2 className="text-sm font-semibold text-foreground-700 mb-3">
          Pending approval ({pending.length})
        </h2>
        {pending.length === 0 && <p className="text-sm text-foreground-400">Nothing pending.</p>}
        <div className="space-y-3">
          {pending.map((reg) => (
            <form
              key={reg.id}
              className="border border-neutral-200/60 rounded-xl bg-background-100 p-4 flex flex-col gap-3"
              action={approveRegistrationAction}
            >
              <input type="hidden" name="registrationId" value={reg.id} />
              <div className="flex items-center gap-2">
                <div className="font-medium text-foreground">{reg.name}</div>
                <ActorKindBadge kind={reg.kind} />
              </div>
              <div className="text-xs text-foreground-500 font-mono">{reg.did}</div>
              {(() => {
                const capabilityOptions = reg.kind === "sensor" ? SENSOR_CAPABILITIES : AGENT_CAPABILITIES;
                return (
                  <>
                    <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                      {capabilityOptions.map((cap) => (
                        <label key={cap} className="flex items-center gap-1.5 text-foreground-700">
                          <input
                            type="checkbox"
                            name="capabilities"
                            value={cap}
                            defaultChecked={(reg.requestedCapabilities as string[]).includes(cap)}
                            className="accent-primary-600"
                          />
                          {cap}
                        </label>
                      ))}
                    </div>
                    {reg.kind === "sensor" && (
                      <p className="text-xs text-foreground-400">
                        Sensors only have this one capability today — approving with it checked
                        starts a live certificate exchange the sensor gates its process telemetry
                        on; leaving it unchecked just connects the sensor with no certificate.
                      </p>
                    )}
                    {reg.kind !== "sensor" && (reg.requestedCapabilities as string[]).length === 0 && (
                      <p className="text-xs text-foreground-400">
                        No capabilities requested yet — approving now grants none unless checked below.
                      </p>
                    )}
                  </>
                );
              })()}
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Approve
                </button>
                <button
                  type="submit"
                  formAction={denyRegistrationAction}
                  className="px-3 py-1.5 border border-neutral-200 text-foreground text-sm font-medium rounded-lg hover:bg-background-200 transition-colors"
                >
                  Deny
                </button>
              </div>
            </form>
          ))}
        </div>
      </section>

      {awaitingDelivery.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-foreground-700 mb-3">
            Approved, awaiting delivery ({awaitingDelivery.length})
          </h2>
          <p className="text-xs text-foreground-400 mb-3">
            Approved — the certificate is delivered via a live exchange the next time each agent is
            connected (docs/CERTIFICATE_WEB_OF_TRUST.md §3.2b), not written immediately.
          </p>
          <div className="space-y-2">
            {awaitingDelivery.map((reg) => (
              <div
                key={reg.id}
                className="border border-warning-200 bg-warning-50 rounded-xl p-4 flex items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <div className="font-medium text-foreground">{reg.name}</div>
                    <ActorKindBadge kind={reg.kind} />
                  </div>
                  <div className="text-xs text-foreground-500 font-mono mt-0.5">{reg.did}</div>
                  <div className="text-xs text-foreground-600 mt-1">
                    Granting: {(reg.assignedCapabilities as string[]).join(", ") || "—"}
                  </div>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-full border shrink-0 bg-warning-100 text-warning-700 border-warning-200">
                  waiting for connection
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {(() => {
        const humans = actors.filter((p) => categoryForKind(p.kind) === "human");
        const agentsAndDevices = actors.filter((p) => categoryForKind(p.kind) !== "human");
        const sections = [
          { title: "Humans", rows: humans },
          { title: "Agents & Devices", rows: agentsAndDevices },
        ];
        return sections.map((section) => (
          <section key={section.title}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground-700">
                {section.title} ({section.rows.length})
              </h2>
              {section.title === "Humans" && (
                <Link href="/admin/actors/invite" className="text-xs text-primary-600 hover:underline">
                  Invite human →
                </Link>
              )}
            </div>
            <div className="overflow-x-auto border border-neutral-200/60 rounded-xl">
              <table className="w-full text-sm bg-background-100">
                <thead className="bg-background-200/40 text-left text-xs text-foreground-500 uppercase">
                  <tr>
                    <th className="px-4 py-2 font-medium">Name</th>
                    <th className="px-4 py-2 font-medium">Kind</th>
                    <th className="px-4 py-2 font-medium">DID</th>
                    <th className="px-4 py-2 font-medium">Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((p) => (
                    <tr key={p.did} className="border-t border-neutral-200/60 hover:bg-background-200/30">
                      <td className="px-4 py-2.5 text-foreground">
                        <Link
                          href={`/admin/actors/${encodeDidParam(p.did)}`}
                          className="hover:text-primary-600 hover:underline"
                        >
                          {p.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <ActorKindBadge kind={p.kind} />
                      </td>
                      <td className="px-4 py-2.5 text-xs text-foreground-500 font-mono">
                        <Link
                          href={`/admin/actors/${encodeDidParam(p.did)}`}
                          className="hover:text-primary-600 hover:underline"
                        >
                          {p.did}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-foreground-500">
                        {p.registeredAt.toISOString()}
                      </td>
                    </tr>
                  ))}
                  {section.rows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-foreground-400">
                        None yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ));
      })()}
    </div>
  );
}
