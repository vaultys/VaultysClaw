import { useState, useEffect } from "react";
import { AlertCircle, Link2 } from "lucide-react";
import { ComingSoonOverlay } from "@/components/shared";
import { modelsClient, realmsClient, unwrap } from "@/lib/api/ts-rest/client";
import type { SafeModel, RealmWithCounts } from "@/lib/contracts";

export function RealmAccessTab({
  model,
  onChanged,
}: {
  model: SafeModel;
  onChanged: () => void;
}) {
  const [allRealms, setAllRealms] = useState<RealmWithCounts[]>([]);
  const [toggling, setToggling] = useState<string | null>(null);
  const grantedIds = new Set(model.realmAccess.map((r) => r.realmId));

  useEffect(() => {
    realmsClient
      .list()
      .then((r) => unwrap(r))
      .then((d) => setAllRealms(d.realms));
  }, []);

  async function toggle(realmId: string, hasAccess: boolean) {
    setToggling(realmId);
    if (hasAccess) {
      unwrap(
        await modelsClient.revokeRealm({
          params: { id: model.id },
          query: { realmId },
        })
      );
    } else {
      unwrap(
        await modelsClient.grantRealm({
          params: { id: model.id },
          body: { realmId },
        })
      );
    }
    setToggling(null);
    onChanged();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-neutral-200 bg-background-100 p-5">
        <div className="flex items-start gap-3 mb-4">
          <AlertCircle className="w-4 h-4 text-foreground-500 mt-0.5 shrink-0" />
          <p className="text-xs text-foreground-500">
            Realms with access can route agents to this model via their LiteLLM
            virtual key. Agents in those realms receive updated config
            automatically.
          </p>
        </div>
        <div className="space-y-2">
          {allRealms.map((realm) => {
            const hasAccess = grantedIds.has(realm.id);
            const loading = toggling === realm.id;
            return (
              <div
                key={realm.id}
                className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-background-200/40 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ background: realm.color }}
                  />
                  <span className="text-sm text-foreground">{realm.name}</span>
                </div>
                <button
                  onClick={() => toggle(realm.id, hasAccess)}
                  disabled={loading}
                  className={`relative w-10 h-5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-background-100 ${hasAccess ? "bg-primary-600" : "bg-background-200 border border-neutral-200"}`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white shadow-sm transition-transform absolute top-0.5 ${hasAccess ? "translate-x-5" : "translate-x-0.5"}`}
                  />
                </button>
              </div>
            );
          })}
          {allRealms.length === 0 && (
            <p className="text-xs text-foreground-500 py-2">No realms found.</p>
          )}
        </div>
      </div>

      {/* Coming soon: budget & routing rules */}
      <ComingSoonOverlay
        title="Fallback & Routing Rules"
        description="Configure fallback chains and routing strategy. Maps to LiteLLM's fallback config — if this model is unavailable, requests route to the configured fallback automatically."
      >
        <div className="rounded-2xl border border-neutral-200 bg-background-100 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">
            Routing Rules
          </h3>
          <div className="space-y-2">
            {[
              "Fallback 1 — gpt-4o (OpenAI)",
              "Fallback 2 — claude-3-5-sonnet (Anthropic)",
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2 px-3 rounded-xl bg-background-200/40 text-sm text-foreground-500"
              >
                <span>{item}</span>
                <Link2 className="w-3.5 h-3.5" />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs text-foreground-500">
            <span>Strategy:</span>
            <span className="px-2 py-0.5 rounded bg-background-200 border border-neutral-200">
              Latency-based
            </span>
          </div>
        </div>
      </ComingSoonOverlay>
    </div>
  );
}
