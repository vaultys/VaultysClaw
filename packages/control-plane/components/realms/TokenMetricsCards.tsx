"use client";

import type { RealmTokenUsage } from "./types";

export function TokenMetricsCards({
  tokenUsage,
}: {
  tokenUsage: RealmTokenUsage;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="bg-background-100 border border-neutral-200 rounded-2xl p-5">
        <p className="text-xs text-foreground-400 mb-2">Input Tokens</p>
        <p className="text-2xl font-bold text-primary-700">
          {(tokenUsage?.promptTokens ?? 0).toLocaleString()}
        </p>
      </div>
      <div className="bg-background-100 border border-neutral-200 rounded-2xl p-5">
        <p className="text-xs text-foreground-400 mb-2">Output Tokens</p>
        <p className="text-2xl font-bold text-primary-700">
          {(tokenUsage?.completionTokens ?? 0).toLocaleString()}
        </p>
      </div>
    </div>
  );
}
