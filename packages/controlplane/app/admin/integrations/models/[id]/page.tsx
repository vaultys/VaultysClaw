import { notFound } from "next/navigation";
import { ModelDAO, WorkspaceDAO } from "@/db";
import PageChrome from "@/components/layout/PageChrome";
import { isRoutableThroughLiteLLM, PROVIDERS, isKnownProvider } from "@/lib/model-providers";
import { getLiteLLMConfig } from "@/lib/litellm";
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
          <div className="text-xs font-medium text-foreground-500 uppercase mb-1">Status</div>
          <span
            className={`text-xs px-2 py-0.5 rounded-full border ${
              model.isActive
                ? "bg-success-100 text-success-700 border-success-200"
                : "bg-neutral-100 text-foreground-500 border-neutral-200"
            }`}
          >
            ● {model.isActive ? "Active" : "Disabled"}
          </span>
        </div>
        <div>
          <div className="text-xs font-medium text-foreground-500 uppercase mb-1">Routing</div>
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
          <h2 className="text-sm font-semibold text-foreground">Workspace access</h2>
          <p className="text-xs text-foreground-400 mt-0.5">
            Which workspaces may use this model. Recorded and audited here; actual enforcement at
            inference time needs the LiteLLM key path, which isn&apos;t built yet.
          </p>
        </div>

        <div className="border border-neutral-200/60 rounded-xl divide-y divide-neutral-200/60">
          {workspaces.map((ws) => {
            const isGranted = granted.has(ws.id);
            return (
              <div key={ws.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: ws.color }}
                  />
                  <span className="text-sm text-foreground truncate">{ws.name}</span>
                  {ws.isDefault && (
                    <span className="text-xs text-foreground-400 shrink-0">default</span>
                  )}
                </div>
                <form action={setModelWorkspaceAccessAction}>
                  <input type="hidden" name="id" value={model.id} />
                  <input type="hidden" name="workspaceId" value={ws.id} />
                  <input type="hidden" name="grant" value={(!isGranted).toString()} />
                  <button
                    type="submit"
                    className={`text-xs px-2 py-1 rounded border transition-colors ${
                      isGranted
                        ? "bg-success-100 text-success-700 border-success-200 hover:bg-success-200/60"
                        : "border-neutral-200 text-foreground-500 hover:bg-background-200/60"
                    }`}
                  >
                    {isGranted ? "Granted" : "Grant"}
                  </button>
                </form>
              </div>
            );
          })}
          {workspaces.length === 0 && (
            <div className="px-4 py-6 text-center text-foreground-400 text-sm">
              No workspaces yet.
            </div>
          )}
        </div>
      </section>

      <section className="space-y-2 pt-2 border-t border-neutral-200/60">
        <h2 className="text-sm font-semibold text-danger-600">Delete this model</h2>
        <p className="text-xs text-foreground-400">
          Removes the registry entry and its workspace grants
          {model.litellmModelName && <>, and deregisters it from LiteLLM</>}. Agents already
          configured to use it will start failing.
        </p>
        <form action={deleteModelAction}>
          <input type="hidden" name="id" value={model.id} />
          <button
            type="submit"
            className="text-xs px-3 py-1.5 border border-danger-200 text-danger-600 rounded-lg hover:bg-danger-50 transition-colors"
          >
            Delete model
          </button>
        </form>
      </section>
    </div>
  );
}
