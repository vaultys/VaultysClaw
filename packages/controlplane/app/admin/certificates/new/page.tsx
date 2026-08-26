import { ActorDAO, CustomCapabilityDAO } from "@/db";
import PageChrome from "@/components/layout/PageChrome";
import ActorSearchSelect from "@/components/ActorSearchSelect";
import { issueCertificateAction } from "../actions";

/** The built-in names this form offers. Custom `vendor:action` capabilities are not listed here —
 *  they come from the registry (docs/CUSTOM_CAPABILITIES.md) and are rendered in their own section
 *  below, so the two can never drift out of sync with what is actually grantable. */
const BUILTIN_CAPABILITIES = [
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
  // A plain capability, not special-cased in this form: if checked alongside anything else here,
  // this whole certificate can never be a future delegation chain's parent (packages/policy's
  // AgentCapability doc comment has the full design).
  "non_delegatable",
] as const;

/** Group registry entries by their free-text `group`, falling back to the vendor — so a grouping
 *  an admin didn't set still produces something meaningful rather than one flat "Other" bucket. */
function groupCapabilities(
  caps: Awaited<ReturnType<typeof CustomCapabilityDAO.list>>
): [string, typeof caps][] {
  const byGroup = new Map<string, typeof caps>();
  for (const cap of caps) {
    const key = cap.group?.trim() || cap.vendor;
    const bucket = byGroup.get(key);
    if (bucket) bucket.push(cap);
    else byGroup.set(key, [cap]);
  }
  return [...byGroup.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/** Issue certificate flow (docs/PAGE_DESIGN.md §1.5). `resource`/`agentDid` query params let
 *  another page (e.g. a workspace's Access tab) deep-link here with the scope pre-filled. */
export default async function NewCertificatePage({
  searchParams,
}: {
  searchParams: Promise<{ resource?: string; agentDid?: string }>;
}) {
  const customCapabilities = await CustomCapabilityDAO.list();
  const [actors, { resource, agentDid }] = await Promise.all([ActorDAO.list(), searchParams]);

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
          <label className="block text-sm font-medium text-foreground mb-1.5">Actor</label>
          <ActorSearchSelect
            name="agentDid"
            required
            defaultValue={agentDid ?? ""}
            actors={actors.map((actor) => ({
              did: actor.did,
              name: actor.name,
              kind: actor.kind,
            }))}
            emptyLabel="Select an actor"
          />
          <p className="text-xs text-foreground-400 mt-1">
            Search by name, actor kind, or full DID. Large directories only render the first matches.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Capabilities</label>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm border border-neutral-200 rounded-lg p-3">
            {BUILTIN_CAPABILITIES.map((cap) => (
              <label key={cap} className="flex items-center gap-1.5 text-foreground-700">
                <input type="checkbox" name="capabilities" value={cap} className="accent-primary-600" />
                {cap}
              </label>
            ))}
          </div>
        </div>

        {customCapabilities.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Custom capabilities
            </label>
            <div className="space-y-3 text-sm border border-neutral-200 rounded-lg p-3">
              {groupCapabilities(customCapabilities).map(([group, caps]) => (
                <div key={group}>
                  <div className="text-xs uppercase text-foreground-400 mb-1">{group}</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {caps.map((cap) => (
                      <label
                        key={cap.id}
                        className="flex items-center gap-1.5 text-foreground-700"
                        title={cap.description ?? undefined}
                      >
                        <input
                          type="checkbox"
                          name="capabilities"
                          value={cap.name}
                          className="accent-primary-600"
                        />
                        <span>{cap.label}</span>
                        <code className="text-xs text-foreground-400">{cap.name}</code>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-foreground-400 mt-1">
              Defined under Integrations &rarr; Capabilities. Scoping, expiry and revocation apply
              exactly as they do to a built-in.
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Scope — resource (optional)
          </label>
          <input
            type="text"
            name="resource"
            defaultValue={resource ?? ""}
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
