import { PrincipalDAO, PendingRegistrationDAO } from "@/db";
import { approveRegistrationAction, denyRegistrationAction } from "./actions";

/** Capabilities an agent-kind Principal can be granted — admin_console_access/portal_access are human-only (§4.5). */
const AGENT_CAPABILITIES = [
  "file_access",
  "internet_access",
  "browser_control",
  "api_call",
  "mail_send",
  "code_execution",
  "system_command",
  "agent_communication",
  "knowledge_search",
] as const;

/**
 * Principals (docs/PAGE_DESIGN.md §1.3) — unified list + the onboarding
 * approval flow (docs/REBUILD_ARCHITECTURE.md §4.2): approving a pending
 * registration *is* the first capability_request/grant round-trip, presented
 * as one action instead of two steps.
 */
export default async function PrincipalsPage() {
  const [principals, pending] = await Promise.all([
    PrincipalDAO.list(),
    PendingRegistrationDAO.listPending(),
  ]);

  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          Pending approval ({pending.length})
        </h2>
        {pending.length === 0 && <p className="text-sm text-gray-400">Nothing pending.</p>}
        <div className="space-y-3">
          {pending.map((reg) => (
            <form
              key={reg.id}
              className="border rounded-lg bg-white p-4 flex flex-col gap-3"
              action={approveRegistrationAction}
            >
              <input type="hidden" name="registrationId" value={reg.id} />
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium">{reg.name}</div>
                  <div className="text-xs text-gray-500">
                    {reg.kind} · {reg.did}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 text-sm">
                {AGENT_CAPABILITIES.map((cap) => (
                  <label key={cap} className="flex items-center gap-1">
                    <input type="checkbox" name="capabilities" value={cap} />
                    {cap}
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-gray-900 text-white text-sm rounded-lg"
                >
                  Approve
                </button>
                <button
                  type="submit"
                  formAction={denyRegistrationAction}
                  className="px-3 py-1.5 border text-sm rounded-lg"
                >
                  Deny
                </button>
              </div>
            </form>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          Principals ({principals.length})
        </h2>
        <table className="w-full text-sm bg-white border rounded-lg overflow-hidden">
          <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Kind</th>
              <th className="px-4 py-2">DID</th>
              <th className="px-4 py-2">Registered</th>
            </tr>
          </thead>
          <tbody>
            {principals.map((p) => (
              <tr key={p.did} className="border-t">
                <td className="px-4 py-2">{p.name}</td>
                <td className="px-4 py-2">{p.kind}</td>
                <td className="px-4 py-2 text-xs text-gray-500">{p.did}</td>
                <td className="px-4 py-2 text-xs text-gray-500">
                  {p.registeredAt.toISOString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
