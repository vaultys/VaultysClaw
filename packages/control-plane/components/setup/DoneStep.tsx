"use client";

import { Check, Shield } from "lucide-react";
import { STEPS } from "./types";

export function DoneStep({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6 py-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-primary-100 border border-primary-200 flex items-center justify-center">
        <Shield className="w-8 h-8 text-primary-600" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-foreground">
          VaultysClaw is ready!
        </h2>
        <p className="text-foreground-500 text-sm mt-2 max-w-sm mx-auto">
          Your control plane is configured. Every setting is adjustable at any
          time from the sidebar.
        </p>
      </div>

      <div className="w-full space-y-2 text-left">
        {STEPS.map(({ id, label, icon: Icon }) => (
          <div
            key={id}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border text-sm bg-success-50 border-success-200 text-success-700"
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="flex-1 font-medium">{label}</span>
            <Check className="w-4 h-4 shrink-0" />
          </div>
        ))}
      </div>

      <button
        onClick={onClose}
        className="mt-2 px-8 py-3 bg-primary-600 hover:bg-primary-500 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-primary-600/20"
      >
        Launch dashboard
      </button>
    </div>
  );
}
