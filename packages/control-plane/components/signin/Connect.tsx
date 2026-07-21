"use client";

import { useVaultysConnect } from "@/hooks/useVaultysConnect";
import Loader from "./Loader";
import FirstConnect from "./FirstConnect";
import SecurityTypeSelector from "./SecurityTypeSelector";
import BastionConnect from "./BastionConnect";
import QRCodeScreen from "./QRCodeScreen";
import CompleteProfile from "./CompleteProfile";

interface ConnectProps {
  /** When true, renders only the card without the full-screen bg wrapper */
  embedded?: boolean;
}

function ConnectCard() {
  const {
    uiStep,
    bastionPhase,
    userConnectionPhase,
    userConnectInfo,
    p2pUrl,
    devLogin,
    devConnecting,
    startConnectionFlow,
    selectSecurityType,
    startP2PMode,
    connectWithoutApp,
    retry,
    hasUsers,
    submitProfile,
    profileSaving,
    profileError,
  } = useVaultysConnect();

  return (
    <div className="w-full max-w-sm bg-background-100 border border-neutral-200 rounded-2xl p-8 shadow-2xl">
      {uiStep === "loading" && <Loader />}

      {(uiStep === "claim-ownership" || uiStep === "first-connect") && (
        <FirstConnect
          claimOwnership={!hasUsers}
          onConnect={startConnectionFlow}
        />
      )}

      {uiStep === "select-security" && (
        <SecurityTypeSelector onSelect={selectSecurityType} />
      )}

      {uiStep === "bastion-connect" && bastionPhase && (
        <BastionConnect bastionPhase={bastionPhase} />
      )}

      {uiStep === "qr-connect" && (
        <QRCodeScreen
          qrUrl={userConnectInfo?.url}
          phase={userConnectionPhase}
          devEnabled={devLogin}
          devConnecting={devConnecting}
          onConnectWithoutApp={connectWithoutApp}
          onSwitchP2P={startP2PMode}
          onRetry={retry}
        />
      )}

      {uiStep === "p2p-connect" && (
        <QRCodeScreen
          qrUrl={p2pUrl}
          phase={userConnectionPhase}
          title="P2P Connection"
          subtitle="Scan with your VaultysID wallet to connect directly"
          showCopy={false}
          onRetry={retry}
        />
      )}

      {uiStep === "complete-profile" && (
        <CompleteProfile
          onSubmit={submitProfile}
          saving={profileSaving}
          error={profileError}
        />
      )}

      {uiStep === "done" && (
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-14 h-14 rounded-full bg-success-100 flex items-center justify-center">
            <svg
              className="w-7 h-7 text-success-600"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <p className="text-foreground font-semibold">
            Signed in! Redirecting…
          </p>
        </div>
      )}
    </div>
  );
}

export default function Connect({ embedded = false }: ConnectProps) {
  if (embedded) {
    return <ConnectCard />;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <ConnectCard />
    </div>
  );
}
