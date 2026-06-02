import { useState, useEffect, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";

interface Props {
  onLogin: (did: string) => void;
}

type Phase = "starting" | "scanning" | "unauthorized" | "error";

interface ConnectResponse {
  connectionString: string;
  sessionId: string;
  qrUrl: string;
  agentDid: string;
}

export default function Login({ onLogin }: Props) {
  const [phase, setPhase] = useState<Phase>("starting");
  const [qrUrl, setQrUrl] = useState("");
  const [agentDid, setAgentDid] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const startSession = useCallback(async () => {
    setPhase("starting");
    setQrUrl("");
    setErrorMsg("");

    let pollTimer: ReturnType<typeof setInterval> | null = null;
    const cleanup = () => {
      if (pollTimer) clearInterval(pollTimer);
    };

    try {
      const r = await fetch("/api/auth/connect");
      if (!r.ok) {
        const err = (await r.json().catch(() => ({ error: r.statusText }))) as {
          error: string;
        };
        throw new Error(err.error ?? r.statusText);
      }
      const {
        qrUrl: url,
        sessionId,
        agentDid: aDid,
      } = (await r.json()) as ConnectResponse;

      setQrUrl(url);
      setAgentDid(aDid);
      setPhase("scanning");

      pollTimer = setInterval(async () => {
        try {
          const sr = await fetch(`/api/auth/status/${sessionId}`);
          if (sr.status === 404) {
            cleanup();
            setErrorMsg("Session expired.");
            setPhase("error");
            return;
          }
          const { status, did } = (await sr.json()) as {
            status: string;
            did?: string;
          };
          if (status === "success" && did) {
            cleanup();
            onLogin(did);
          } else if (status === "unauthorized") {
            cleanup();
            setPhase("unauthorized");
          } else if (status === "failed") {
            cleanup();
            setErrorMsg("Authentication failed.");
            setPhase("error");
          }
        } catch {
          cleanup();
          setErrorMsg("Connection error.");
          setPhase("error");
        }
      }, 1500);
    } catch (err) {
      cleanup();
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
      setPhase("error");
    }
  }, [onLogin]);

  useEffect(() => {
    startSession();
  }, [startSession]);

  return (
    <div className="flex items-center justify-center min-h-full bg-background-50">
      <div className="bg-background-100 border border-neutral-200 rounded-xl p-8 w-[360px] max-w-[95vw] flex flex-col items-center gap-5">
        {/* Header */}
        <h1 className="text-foreground text-lg font-bold">VaultysClaw Agent</h1>
        <p className="text-foreground-500 text-xs text-center leading-relaxed">
          Scan with your{" "}
          <strong className="text-foreground">Vaultys Wallet</strong> to
          authenticate.
          <br />
          Access requires a valid delegation for this agent.
        </p>

        {/* QR frame */}
        <div className="w-52 h-52 bg-white rounded-lg flex items-center justify-center p-1.5 flex-shrink-0">
          {phase === "starting" && (
            <div className="w-7 h-7 border-2 border-neutral-200 border-t-primary rounded-full animate-spin" />
          )}
          {phase === "scanning" && qrUrl && (
            <QRCodeSVG value={qrUrl} size={196} level="M" />
          )}
          {(phase === "error" || phase === "unauthorized") && (
            <span className="text-danger-500 text-3xl">✗</span>
          )}
        </div>

        {/* Status message */}
        <div className="text-xs text-center min-h-[32px] flex items-center justify-center px-2">
          {phase === "starting" && (
            <span className="text-primary-500">
              Starting authentication session…
            </span>
          )}
          {phase === "scanning" && (
            <span className="text-primary-500">
              Scan the QR code with your Vaultys Wallet
            </span>
          )}
          {phase === "unauthorized" && (
            <span className="text-warning-600">
              Access denied — no valid delegation found for this agent.
            </span>
          )}
          {phase === "error" && (
            <span className="text-danger-500">
              {errorMsg || "Authentication failed."}
            </span>
          )}
        </div>

        {/* Retry button */}
        {(phase === "error" || phase === "unauthorized") && (
          <button
            onClick={startSession}
            className="px-4 py-1.5 bg-background-200 border border-neutral-200 rounded-md text-foreground text-xs hover:bg-neutral-200 transition-colors"
          >
            Retry
          </button>
        )}

        {/* Agent DID footer */}
        {agentDid && (
          <>
            <hr className="w-full border-neutral-200" />
            <p className="text-foreground-400 text-[10px] text-center break-all">
              Agent:{" "}
              <span className="text-foreground-400">
                {agentDid.length > 40 ? `${agentDid.slice(0, 40)}…` : agentDid}
              </span>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
