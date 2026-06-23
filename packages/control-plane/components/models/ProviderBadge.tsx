export function ProviderBadge({ provider }: Readonly<{ provider: string }>) {
  const colors: Record<string, string> = {
    openai: "bg-success-100 text-success-700 border-success-300",
    "openai-compatible": "bg-primary-100 text-primary-700 border-primary-300",
    anthropic: "bg-warning-100 text-warning-700 border-warning-300",
    google: "bg-warning-100 text-warning-700 border-warning-300",
    ollama: "bg-secondary-100 text-secondary-700 border-secondary-300",
  };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full border font-medium ${colors[provider] ?? "bg-neutral-100 text-neutral-600 border-neutral-300"}`}
    >
      {provider}
    </span>
  );
}
