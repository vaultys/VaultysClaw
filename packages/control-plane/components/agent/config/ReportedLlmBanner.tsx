export function ReportedLlmBanner({
  reportedLlm,
  isLocalEnvConfig,
}: {
  reportedLlm: { provider: string; model: string };
  /** True when neither a manual config nor an agent key drives the agent. */
  isLocalEnvConfig: boolean;
}) {
  return (
    <div className="bg-background-200 rounded-lg border border-neutral-200 px-4 py-3">
      <div className="text-xs text-foreground-500 uppercase tracking-wider font-medium mb-1.5">
        Agent Active LLM
      </div>
      <div className="flex items-center gap-3">
        <code className="text-sm font-mono text-primary-400">
          {reportedLlm.provider}/{reportedLlm.model}
        </code>
        <span className="text-xs text-foreground-400">
          reported by agent
          {isLocalEnvConfig ? " (local env config)" : ""}
        </span>
      </div>
    </div>
  );
}
