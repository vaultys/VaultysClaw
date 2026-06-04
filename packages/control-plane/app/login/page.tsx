import LoginFlowDiagram from "@/components/signin/LoginFlowDiagram";
import { ShieldCheck } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="h-screen bg-gradient-to-br from-neutral-950 via-primary-950 to-neutral-950 relative overflow-hidden">
      {/* Floating header */}
      <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-8 py-5 bg-gradient-to-b from-black/30 to-transparent pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto animate-fade-in-up">
          <div className="w-9 h-9 bg-primary-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary-600/30 text-lg leading-none">
            🦞
          </div>
          <span className="text-xl font-bold tracking-tight text-white">
            VaultysClaw
          </span>
        </div>
        <div
          className="flex items-center gap-1.5 bg-success-900/30 border border-success-700/50 rounded-full px-3 py-1 pointer-events-auto animate-fade-in-up"
          style={{ animationDelay: "100ms" }}
        >
          <ShieldCheck className="w-3.5 h-3.5 text-success-400" />
          <span className="text-xs font-bold text-success-400">
            Secure by design
          </span>
        </div>
      </header>

      {/* Subtitle — sits below the header, above the canvas */}
      <div className="absolute top-[78px] left-0 right-0 z-10 text-center pointer-events-none">
        <p
          className="text-white/30 text-sm tracking-wide animate-fade-in-up"
          style={{ animationDelay: "200ms" }}
        >
          Sign in through the control plane below
        </p>
      </div>

      {/* ReactFlow canvas — fills the full viewport */}
      <div className="w-full h-full">
        <LoginFlowDiagram />
      </div>
    </div>
  );
}
