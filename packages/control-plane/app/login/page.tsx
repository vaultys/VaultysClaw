export const dynamic = "force-dynamic";

import LoginFlowDiagram from "@/components/signin/LoginFlowDiagram";
import OidcLoginButton from "@/components/signin/OidcLoginButton";
import ThemeToggle from "@/components/signin/ThemeToggle";
import { ShieldCheck } from "lucide-react";
import { getOidcConfig } from "@/lib/oidc-config";

export default async function LoginPage() {
  const oidc = await getOidcConfig();
  const oidcEnabled = !!oidc;
  const oidcProviderName = oidc?.providerName ?? "SSO";
  return (
    <div className="h-screen vc-login-bg relative overflow-hidden">
      {/* Floating header */}
      <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-8 py-5 bg-gradient-to-b from-foreground-950/10 to-transparent pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto animate-fade-in-up">
          <div className="w-9 h-9 bg-primary-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary-600/30 text-lg leading-none">
            🦞
          </div>
          <span className="text-xl font-bold tracking-tight vc-text">
            VaultysClaw
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <div
            className="flex items-center gap-1.5 vc-bg-success-subtle border vc-border-success rounded-full px-3 py-1 pointer-events-auto animate-fade-in-up"
            style={{ animationDelay: "100ms" }}
          >
            <ShieldCheck className="w-3.5 h-3.5 vc-text-success" />
            <span className="text-xs font-bold vc-text-success">
              Secure by design
            </span>
          </div>
        </div>
      </header>

      {/* Subtitle — sits below the header, above the canvas */}
      <div className="absolute top-[78px] left-0 right-0 z-10 text-center pointer-events-none">
        <p
          className="vc-text-subtle text-sm tracking-wide animate-fade-in-up"
          style={{ animationDelay: "200ms" }}
        >
          Sign in through the control plane below
        </p>
      </div>

      {/* ReactFlow canvas — fills the full viewport */}
      <div className="w-full h-full">
        <LoginFlowDiagram />
      </div>

      {/* OIDC / SSO login button — shown when an OIDC provider is configured */}
      {oidcEnabled && (
        <div className="absolute bottom-8 left-0 right-0 z-20 flex justify-center">
          <OidcLoginButton providerName={oidcProviderName} />
        </div>
      )}
    </div>
  );
}
