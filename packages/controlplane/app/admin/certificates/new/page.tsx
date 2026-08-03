import { PrincipalDAO } from "@/db";
import PageChrome from "@/components/layout/PageChrome";
import { issueCertificateAction } from "../actions";

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
  "admin_console_access",
  "portal_access",
] as const;

/** Issue certificate flow (docs/PAGE_DESIGN.md §1.5). */
export default async function NewCertificatePage() {
  const principals = await PrincipalDAO.list();

  return (
    <div className="p-6 max-w-2xl">
      <PageChrome
        toolbar={{ title: "Issue certificate" }}
        breadcrumbs={[
          { label: "Certificates", href: "/admin/certificates" },
          { label: "Issue certificate" },
        ]}
      />

      <form action={issueCertificateAction} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Principal</label>
          <select
            name="agentDid"
            required
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
          >
            <option value="">Select a Principal…</option>
            {principals.map((p) => (
              <option key={p.did} value={p.did}>
                {p.name} ({p.kind}) — {p.did}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Capabilities</label>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm border border-neutral-200 rounded-lg p-3">
            {AGENT_CAPABILITIES.map((cap) => (
              <label key={cap} className="flex items-center gap-1.5 text-foreground-700">
                <input type="checkbox" name="capabilities" value={cap} className="accent-primary-600" />
                {cap}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Scope — resource (optional)
          </label>
          <input
            type="text"
            name="resource"
            placeholder='e.g. file:///reports/q3.pdf — leave empty for a standing grant'
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
          />
          <p className="text-xs text-foreground-400 mt-1">
            Leaving this empty issues a standing grant, not scoped to one resource.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Expiry</label>
          <select
            name="expiryPreset"
            defaultValue="30d"
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
          >
            <option value="1h">1 hour</option>
            <option value="1d">1 day</option>
            <option value="30d">30 days</option>
            <option value="1y">1 year</option>
            <option value="never">No expiry</option>
          </select>
          <label className="flex items-start gap-2 mt-2 text-xs text-warning-700">
            <input type="checkbox" name="confirmNoExpiry" className="mt-0.5 accent-warning-600" />
            <span>
              I understand this certificate will remain valid until someone explicitly revokes
              it — required only if &quot;No expiry&quot; is selected above.
            </span>
          </label>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Issue certificate
          </button>
        </div>
      </form>
    </div>
  );
}
