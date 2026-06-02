import type { BastionPhase } from "@/hooks/useVaultysConnect";

interface BastionConnectProps {
  readonly bastionPhase: BastionPhase;
}

const steps: { phase: BastionPhase; label: string; description: string }[] = [
  { phase: "connect", label: "Initializing", description: "Establishing secure connection with browser device…" },
  { phase: "waiting", label: "Waiting", description: "Waiting for your wallet to respond…" },
  { phase: "authenticate", label: "Authenticating", description: "Verifying your browser device securely…" },
  { phase: "success", label: "Connected", description: "Browser device authenticated!" },
  { phase: "failure", label: "Failed", description: "Could not connect. Please try again." },
];

export default function BastionConnect({ bastionPhase }: BastionConnectProps) {
  const step = steps.find((s) => s.phase === bastionPhase) ?? steps[0];
  const isError = bastionPhase === "failure";
  const isDone = bastionPhase === "success";

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div
        className={`w-16 h-16 rounded-full flex items-center justify-center ${isError ? "bg-red-100 dark:bg-red-900/40" : isDone ? "bg-green-100 dark:bg-green-900/40" : "bg-blue-100 dark:bg-blue-900/40"
          }`}
      >
        {isError ? (
          <svg className="w-8 h-8 text-red-500 dark:text-red-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : isDone ? (
          <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <div className="w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      <div>
        <p className="text-foreground font-semibold text-lg">{step.label}</p>
        <p className="text-foreground-500 text-sm mt-1">{step.description}</p>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-xs bg-background-200 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all duration-500 ${isError ? "bg-red-500" : "bg-blue-500"}`}
          style={{
            width: bastionPhase === "connect" ? "33%" : bastionPhase === "waiting" ? "66%" : bastionPhase === "authenticate" ? "90%" : "100%",
          }}
        />
      </div>
    </div>
  );
}
