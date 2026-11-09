import { notFound } from "next/navigation";
import { ModelDAO, WorkspaceDAO } from "@/db";
import PageChrome from "@/components/layout/PageChrome";
import { isRoutableThroughLiteLLM, PROVIDERS, isKnownProvider } from "@/lib/model-providers";
import { getLiteLLMConfig } from "@/lib/litellm";
import { Badge } from "@/components/ui/Badge";
import ModelForm from "../ModelForm";
import { updateModelAction, deleteModelAction, setModelWorkspaceAccessAction } from "../../actions";

export default async function ModelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [model, workspaces, litellm] = await Promise.all([
    ModelDAO.findById(id),
    WorkspaceDAO.list(),
    getLiteLLMConfig(),
  ]);
  if (!model) notFound();

  const granted = new Set(model.workspaceAccess.map((a) => a.workspaceId));
  const providerLabel = isKnownProvider(model.provider)
    ? PROVIDERS[model.provider].label
    : model.provider;
  const routable = isRoutableThroughLiteLLM(model.provider);

  return (
    <div className="p-6 max-w-2xl space-y-8">
      <PageChrome
        toolbar={{ title: model.name, description: providerLabel }}
        breadcrumbs={[
          { label: "Integrations", href: "/admin/integrations?tab=models" },
          { label: model.name },
        ]}
      />

      <div className="flex flex-wrap gap-8">
        <div>
          <div className="mb-1 text-xs text-foreground-500">Status</div>
          <Badge tone={model.isActive ? "positive" : "muted"}>
            {model.isActive ? "Active" : "Disabled"}
          </Badge>
        </div>
        <div>
          <div className="mb-1 text-xs text-foreground-500">Routing</div>
          {/* The honest three-way answer, not a boolean: a model can be routable in
              principle but unpushed because the proxy isn't configured. */}
          {!routable ? (
            <span className="text-xs text-foreground-500">
              Not routed — agent-SDK provider
            </span>
          ) : !litellm ? (
            <span className="text-xs text-warning-700">
              LiteLLM not configured — catalogued only
            </span>
          ) : (
            <code className="text-xs font-mono text-foreground-500">{model.litellmModelName}</code>
          )}
        </div>
      </div>

      <ModelForm action={updateModelAction} model={model} submitLabel="Save changes" />

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium text-foreground">Workspace access</h2>
          <p className="mt-0.5 text-xs leading-5 text-foreground-500">
            Which workspaces may use this model. Recorded and audited here; actual enforcement at
            inference time needs the LiteLLM key path, which isn&apos;t built yet.
          </p>
        </div>

        <div className="divide-y divide-neutral-200/60 rounded-xl border border-neutral-200/60 bg-background-100">
          {workspaces.map((ws) => {
            const isGranted = granted.has(ws.id);
            return (
              <div key={ws.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: ws.color }}
                  />
                  <span className="text-sm text-foreground truncate">{ws.name}</span>
                  {ws.isDefault && (
                    <span className="text-xs text-foreground-500 shrink-0">default</span>
                  )}
                </div>
                <form action={setModelWorkspaceAccessAction}>
                  <input type="hidden" name="id" value={model.id} />
                  <input type="hidden" name="workspaceId" value={ws.id} />
                  <input type="hidden" name="grant" value={(!isGranted).toString()} />
                  <button
                    type="submit"
                    title={isGranted ? "Click to revoke" : undefined}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-background-100 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-background-200"
                  >
                    {isGranted && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success-600" />}
                    {isGranted ? "Granted" : "Grant"}
                  </button>
                </form>
              </div>
            );
          })}
          {workspaces.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-foreground-500">
              No workspaces yet
            </div>
          )}
        </div>
      </section>

      <section className="space-y-2 border-t border-neutral-200/60 pt-6">
        <h2 className="text-sm font-medium text-danger-700">Delete this model</h2>
        <p className="text-xs leading-5 text-foreground-500">
          Removes the registry entry and its workspace grants
          {model.litellmModelName && <>, and deregisters it from LiteLLM</>}. Agents already
          configured to use it will start failing.
        </p>
        <form action={deleteModelAction}>
          <input type="hidden" name="id" value={model.id} />
          <button
            type="submit"
            className="rounded-lg border border-neutral-200 bg-background-100 px-3 py-1.5 text-xs font-medium text-danger-700 transition-colors hover:bg-background-200"
          >
            Delete model
          </button>
        </form>
      </section>
    </div>
  );
}
