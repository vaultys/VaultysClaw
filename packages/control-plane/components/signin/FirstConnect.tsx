interface FirstConnectProps {
  readonly claimOwnership: boolean;
  readonly onConnect: () => void;
}

export default function FirstConnect({ claimOwnership, onConnect }: FirstConnectProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-8 text-center">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">
          {claimOwnership ? "Claim Ownership" : "Welcome back"}
        </h1>
        <p className="text-foreground-500 max-w-xs">
          {claimOwnership
            ? "No users exist yet. Connect your VaultysID to become the owner of this control plane."
            : "Authenticate with your VaultysID to access the control plane."}
        </p>
      </div>

      <button
        onClick={onConnect}
        className="flex items-center gap-3 px-6 py-4 bg-blue-600 hover:bg-blue-500 text-white text-lg font-semibold rounded-xl transition-colors w-full max-w-sm justify-center"
      >
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
        {claimOwnership ? "Claim with VaultysID" : "Connect with VaultysID"}
      </button>
    </div>
  );
}
