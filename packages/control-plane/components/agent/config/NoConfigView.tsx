export function NoConfigView({
  litellmConfigured,
  hasRealmRouting,
  registryModelCount,
}: {
  litellmConfigured: boolean;
  hasRealmRouting: boolean;
  registryModelCount: number;
}) {
  return (
    <div className="px-4 py-8 text-center">
      <p className="text-foreground-500 text-sm">
        No remote config set. The agent uses its local environment variables{" "}
        <code className="text-xs bg-background-200 px-1.5 py-0.5 rounded">
          LLM_PROVIDER
        </code>
        ,{" "}
        <code className="text-xs bg-background-200 px-1.5 py-0.5 rounded">
          LLM_MODEL
        </code>
        , etc.
      </p>
      {litellmConfigured && (
        <p className="text-xs text-foreground-500 mt-2">
          LiteLLM is configured — click Configure to provision an agent key.
        </p>
      )}
      {!litellmConfigured && hasRealmRouting && (
        <p className="text-xs text-foreground-500 mt-2">
          Realm routing is available — click Configure to route via your LiteLLM
          proxy.
        </p>
      )}
      {!litellmConfigured && !hasRealmRouting && registryModelCount > 0 && (
        <p className="text-xs text-foreground-500 mt-2">
          {registryModelCount} model{registryModelCount !== 1 ? "s" : ""}{" "}
          available in the registry — click Configure to assign one.
        </p>
      )}
    </div>
  );
}
