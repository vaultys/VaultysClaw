"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Check, Loader2, AlertCircle, Shield } from "lucide-react";
import QRCodeScreen from "@/components/signin/QRCodeScreen";
import {
  runBrowserDirectConnect,
  type WalletSecurityType,
} from "@/lib/browser-connect";
import {
  adminApi,
  publicApi,
  unwrap,
} from "@/lib/api/ts-rest/client";
import { Invitation } from "@/lib/contracts";

type InvitePhase =
  | "loading"
  | "info"
  | "qr-loading"
  | "qr"
  | "success"
  | "error"
  | "expired";

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [phase, setPhase] = useState<InvitePhase>("loading");
  const [details, setDetails] = useState<Invitation | null>(null);
  const [error, setError] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [certKey, setCertKey] = useState("");
  const [devLogin, setDevLogin] = useState(false);
  const [devConnecting, setDevConnecting] = useState(false);

  // Fetch invitation details
  useEffect(() => {
    const load = async () => {
      try {
        const invitation = unwrap(
          await adminApi.invitations.get({ params: { token } })
        );
        if (!invitation) {
          setPhase("expired");
          return;
        }
        setDetails(invitation);
        setPhase("info");
      } catch (err) {
        setError((err as Error).message);
        setPhase("error");
      }
    };
    load();
  }, [token]);

  // Load dev-login availability
  useEffect(() => {
    adminApi.server
      .getSettings()
      .then((res) => setDevLogin(!!unwrap(res).devLogin))
      .catch(() => {});
  }, []);

  const generateQR = useCallback(async () => {
    if (!token) return;
    setPhase("qr-loading");
    try {
      const data = unwrap(
        await adminApi.users.inviteFromEmail({ body: { token } })
      );
      setQrUrl(data.qrUrl);
      setCertKey(data.key);
      setPhase("qr");

      // Poll for connection using the returned invite token
      for (let i = 0; i < 180; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const { status: s } = unwrap(
          await publicApi.userAuth.listen({ params: { token: data.inviteToken } })
        );
        if (s === 2) {
          // Delete the invitation after successful connection
          await adminApi.invitations.delete({ params: { token } }).catch(() => {});
          setPhase("success");
          return;
        }
        if (s === -2) {
          setPhase("error");
          setError("Connection failed");
          return;
        }
      }
      setPhase("error");
      setError("Connection timed out");
    } catch (err) {
      setPhase("error");
      setError((err as Error).message);
    }
  }, [token]);

  const connectWithoutApp = useCallback(
    async (securityType: WalletSecurityType) => {
      if (!certKey) return;
      setDevConnecting(true);
      try {
        await runBrowserDirectConnect({
          key: certKey,
          service: "register",
          securityType,
        });
      } catch {
        // Errors surface via the running listen poll → error phase.
      } finally {
        setDevConnecting(false);
      }
    },
    [certKey]
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50/70 via-background to-secondary-50/40 p-4">
      {/* Ambient blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[450px] bg-primary-200/40 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-secondary-200/30 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Loading */}
        {phase === "loading" && (
          <div className="text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-primary-100 border border-primary-200 flex items-center justify-center mx-auto">
              <Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
            </div>
            <p className="text-foreground-500">Loading invitation…</p>
          </div>
        )}

        {/* Expired */}
        {phase === "expired" && (
          <div className="bg-background-100 border border-neutral-200 rounded-2xl p-6 shadow-sm text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-danger-100 border border-danger-200 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6 text-danger-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">
                Invitation expired
              </h2>
              <p className="text-foreground-500 text-sm mt-1">
                This invitation link is no longer valid. Please request a new
                one from your admin.
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {phase === "error" && (
          <div className="bg-background-100 border border-neutral-200 rounded-2xl p-6 shadow-sm text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-danger-100 border border-danger-200 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6 text-danger-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Error</h2>
              <p className="text-foreground-500 text-sm mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Invitation details & QR generation */}
        {phase === "info" && details && (
          <div className="bg-background-100 border border-neutral-200 rounded-2xl p-8 shadow-sm space-y-6">
            {/* Header */}
            <div className="text-center">
              <div className="w-12 h-12 bg-primary-600 rounded-xl flex items-center justify-center text-sm leading-none shadow shadow-primary-600/30 mx-auto mb-4">
                🦞
              </div>
              <h1 className="text-2xl font-bold text-foreground">
                Welcome to VaultysClaw!
              </h1>
              <p className="text-foreground-500 text-sm mt-2">
                Secure AI control plane for teams
              </p>
            </div>

            {/* Invitation details */}
            <div className="space-y-3 bg-background-200 rounded-xl p-4">
              <div className="flex justify-between items-start text-sm">
                <span className="text-foreground-500">Name</span>
                <span className="font-medium text-foreground text-right">
                  {details.name}
                </span>
              </div>
              <div className="flex justify-between items-start text-sm">
                <span className="text-foreground-500">Email</span>
                <span className="font-medium text-foreground text-right">
                  {details.email}
                </span>
              </div>
              <div className="flex justify-between items-start text-sm">
                <span className="text-foreground-500">Role</span>
                <span className="font-medium text-foreground text-right capitalize">
                  {details.role}
                </span>
              </div>
            </div>

            {/* Info text */}
            <p className="text-foreground-500 text-sm text-center leading-relaxed">
              To complete your setup, scan the QR code with your Vaultys wallet
              app.
            </p>

            {/* CTA Button */}
            <button
              onClick={generateQR}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary-600 hover:bg-primary-500 text-white font-medium rounded-xl transition-colors"
            >
              <Shield className="w-4 h-4" /> Generate QR Code
            </button>
          </div>
        )}

        {/* QR Loading */}
        {phase === "qr-loading" && (
          <div className="bg-background-100 border border-neutral-200 rounded-2xl p-8 shadow-sm text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-primary-100 border border-primary-200 flex items-center justify-center mx-auto">
              <Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
            </div>
            <p className="text-foreground-500">Generating QR code…</p>
          </div>
        )}

        {/* QR Code */}
        {phase === "qr" && details && (
          <div className="bg-background-100 border border-neutral-200 rounded-2xl p-8 shadow-sm">
            <QRCodeScreen
              qrUrl={qrUrl}
              phase="waiting"
              title="Scan QR Code"
              subtitle="Open your Vaultys Wallet and scan this code"
              devEnabled={devLogin}
              devConnecting={devConnecting}
              onConnectWithoutApp={connectWithoutApp}
              onRetry={() => {
                setPhase("info");
                setError("");
              }}
            />
          </div>
        )}

        {/* Success */}
        {phase === "success" && (
          <div className="bg-background-100 border border-neutral-200 rounded-2xl p-8 shadow-sm text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-success-100 border border-success-300 flex items-center justify-center mx-auto">
              <Check className="w-6 h-6 text-success-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">
                Welcome aboard!
              </h2>
              <p className="text-foreground-500 text-sm mt-2">
                Your account is set up. You can now log in.
              </p>
            </div>
            <button
              onClick={() => router.push("/login")}
              className="w-full px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white font-medium rounded-xl transition-colors"
            >
              Go to Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
