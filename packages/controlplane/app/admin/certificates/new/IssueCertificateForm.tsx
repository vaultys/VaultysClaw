"use client";

import { useEffect, useMemo, useState } from "react";
import SrtBuilder from "@/components/SrtBuilder";
import ActorSearchSelect, { type ActorSearchOption } from "@/components/ActorSearchSelect";
import type { AgentCapability } from "@vaultysclaw/policy";

export interface TemplateOption {
  id: string;
  name: string;
  description: string | null;
  settings: Record<string, unknown> | null;
  allowedDomains: string[];
}

export interface CustomCapabilityOption {
  id: string;
  name: string;
  label: string;
  description?: string | null;
  group?: string | null;
  vendor: string;
}

const BUILTINS_BY_KIND = {
  all: [
    "portal_access",
    "admin_console_access",
    "file_read",
    "file_write",
    "internet_access",
    "browser_control",
    "api_call",
    "mail_send",
    "code_execution",
    "system_command",
    "agent_communication",
    "knowledge_search",
    "process_read",
    "non_delegatable",
  ],
  human: [
    "portal_access",
    "admin_console_access",
    "knowledge_search",
    "agent_communication",
    "non_delegatable",
  ],
  sensor: ["process_read"],
  agent: [
    "file_read",
    "file_write",
    "internet_access",
    "browser_control",
    "api_call",
    "mail_send",
    "code_execution",
    "system_command",
    "agent_communication",
    "knowledge_search",
    "non_delegatable",
  ],
} as const satisfies Record<string, readonly AgentCapability[]>;

function builtinsForKind(kind: string): readonly AgentCapability[] {
  if (kind === "human") return BUILTINS_BY_KIND.human;
  if (kind === "sensor") return BUILTINS_BY_KIND.sensor;
  return BUILTINS_BY_KIND.agent;
}

function groupCapabilities(caps: CustomCapabilityOption[]): [string, CustomCapabilityOption[]][] {
  const byGroup = new Map<string, CustomCapabilityOption[]>();
  for (const cap of caps) {
    const key = cap.group?.trim() || cap.vendor;
    const bucket = byGroup.get(key);
    if (bucket) bucket.push(cap);
    else byGroup.set(key, [cap]);
  }
  return [...byGroup.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export default function IssueCertificateForm({
  actors,
  customCapabilities,
  templates,
  defaultTemplateByActor,
  defaultActorDid,
  defaultResource,
  action,
}: {
  actors: ActorSearchOption[];
  customCapabilities: CustomCapabilityOption[];
  templates: TemplateOption[];
  /** Actor DID → the template assigned to that actor's workspace, if any. */
  defaultTemplateByActor: Record<string, string>;
  defaultActorDid?: string;
  defaultResource?: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const [actorDid, setActorDid] = useState(defaultActorDid ?? "");
  const [templateId, setTemplateId] = useState(
    defaultActorDid ? (defaultTemplateByActor[defaultActorDid] ?? "") : ""
  );

  // Follow the actor's workspace default when the actor changes. Deliberately
  // not derived state: once an admin picks a template by hand it is theirs, and
  // recomputing it on every render would silently undo that.
  useEffect(() => {
    setTemplateId(actorDid ? (defaultTemplateByActor[actorDid] ?? "") : "");
  }, [actorDid, defaultTemplateByActor]);

  const template = templates.find((t) => t.id === templateId);
  const selectedActor = actors.find((actor) => actor.did === actorDid);
  const builtins = selectedActor ? builtinsForKind(selectedActor.kind) : BUILTINS_BY_KIND.all;
  const showCustomCapabilities = !!selectedActor && selectedActor.kind !== "sensor" && customCapabilities.length > 0;
  const customGroups = useMemo(() => groupCapabilities(customCapabilities), [customCapabilities]);

  return (
    <form action={action} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Actor</label>
        <ActorSearchSelect
          name="agentDid"
          required
          defaultValue={defaultActorDid ?? ""}
          actors={actors}
          emptyLabel="Select an actor"
          onValueChange={setActorDid}
        />
        <p className="text-xs text-foreground-400 mt-1">
          Search by name, actor kind, or full DID. The capability list updates for the selected
          actor type.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Capabilities</label>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm border border-neutral-200 rounded-lg p-3">
          {builtins.map((cap) => (
            <label key={cap} className="flex items-center gap-1.5 text-foreground-700">
              <input type="checkbox" name="capabilities" value={cap} className="accent-primary-600" />
              {cap}
            </label>
          ))}
        </div>
        {selectedActor && (
          <p className="text-xs text-foreground-400 mt-1">
            Showing built-ins grantable to a {selectedActor.kind} actor.
          </p>
        )}
        {!selectedActor && (
          <p className="text-xs text-foreground-400 mt-1">
            Select an actor to narrow this list to capabilities grantable for that actor type.
          </p>
        )}
      </div>

      {showCustomCapabilities && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Custom capabilities
          </label>
          <div className="space-y-3 text-sm border border-neutral-200 rounded-lg p-3">
            {customGroups.map(([group, caps]) => (
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

      <section className="border-t border-neutral-200 pt-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">Scope &amp; expiry</h2>
        <label className="block text-sm font-medium text-foreground mb-1.5">
          Scope — resource (optional)
        </label>
        <input
          type="text"
          name="resource"
          defaultValue={defaultResource ?? ""}
          placeholder='e.g. file:///reports/q3.pdf — leave empty for a standing grant'
          className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
        />
        <p className="text-xs text-foreground-400 mt-1">
          Leaving this empty issues a standing grant, not scoped to one resource.
        </p>
      </section>

      <section className="border-t border-neutral-200 pt-5">
        <h2 className="text-sm font-semibold text-foreground">OS confinement (tier B)</h2>
        <p className="text-xs text-foreground-500 mt-1 mb-4">
          Enforced below the tool boundary by{" "}
          <a
            href="https://github.com/anthropic-experimental/sandbox-runtime"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            sandbox-runtime
          </a>{" "}
          on the host holding this certificate. The host merges its own safety floor in on top;
          nothing set here can remove those denies.
        </p>

        {templates.length > 0 && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Start from a template
            </label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
            >
              <option value="">No template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-foreground-400 mt-1">
              {template?.description ??
                "Pre-fills the fields below. Whatever you submit is what gets signed."}
            </p>
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Allowed domains
          </label>
          <input
            key={`domains-${templateId}`}
            type="text"
            name="allowedDomains"
            defaultValue={template?.allowedDomains.join(", ") ?? ""}
            placeholder="api.anthropic.com, github.com"
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
          />
          <p className="text-xs text-foreground-400 mt-1">
            Leaving this empty means <strong>no domain limit</strong>. A supervised harness with
            confinement set to <code>require</code> cannot express that and will refuse to launch.
          </p>
        </div>

        {/* Remounted per template so picking one reloads the builder's initial
            state; the builder owns its edits from that point on. */}
        <SrtBuilder key={`srt-${templateId}`} name="srt" defaultValue={template?.settings ?? null} />
      </section>

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
            I understand this certificate will remain valid until someone explicitly revokes it —
            required only if &quot;No expiry&quot; is selected above.
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
  );
}
