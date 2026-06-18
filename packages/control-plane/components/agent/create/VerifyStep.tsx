"use client";

import { useEffect, useRef } from "react";
import {
  Bot,
  Loader2,
  CheckCircle2,
  ArrowRight,
  AlertTriangle,
  MessageSquare,
} from "lucide-react";

interface VerifyStepProps {
  verifyText: string;
  verifyDone: boolean;
  verifyError: string | null;
  onRetry: () => void;
  onFinish: () => void;
}

export function VerifyStep({
  verifyText,
  verifyDone,
  verifyError,
  onRetry,
  onFinish,
}: VerifyStepProps) {
  const verifyRef = useRef<HTMLPreElement>(null);

  // Keep the streamed response scrolled to the bottom
  useEffect(() => {
    if (verifyRef.current) {
      verifyRef.current.scrollTop = verifyRef.current.scrollHeight;
    }
  }, [verifyText]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1">
          Verify agent setup
        </h2>
        <p className="text-sm text-foreground-500">
          Sending a test prompt to confirm the agent is online and reports its
          tools correctly.
        </p>
      </div>

      {/* Prompt sent */}
      <div className="bg-background-200 border border-neutral-200 rounded-xl px-4 py-3 flex items-start gap-3">
        <MessageSquare
          size={14}
          className="text-foreground-500 shrink-0 mt-0.5"
        />
        <p className="text-sm text-foreground italic">
          &ldquo;List all the tools and skills you currently have access
          to.&rdquo;
        </p>
      </div>

      {/* Response area */}
      <div className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-neutral-200 bg-background-200">
          <Bot size={14} className="text-primary-400" />
          <span className="text-xs font-medium text-foreground-500">
            Agent response
          </span>
          {!verifyDone && !verifyError && (
            <Loader2 size={12} className="animate-spin text-primary-400 ml-auto" />
          )}
          {verifyDone && !verifyError && (
            <CheckCircle2 size={12} className="text-success-500 ml-auto" />
          )}
          {verifyError && (
            <AlertTriangle size={12} className="text-danger-400 ml-auto" />
          )}
        </div>
        {verifyError ? (
          <div className="px-4 py-4 text-sm text-danger-600 dark:text-danger-400 flex items-center gap-2">
            <AlertTriangle size={14} />
            {verifyError}
          </div>
        ) : (
          <pre
            ref={verifyRef}
            className="p-4 text-sm font-mono text-foreground whitespace-pre-wrap break-words leading-relaxed max-h-72 overflow-y-auto"
          >
            {verifyText || (
              <span className="text-foreground-400 animate-pulse">
                Waiting for response…
              </span>
            )}
          </pre>
        )}
      </div>

      {verifyDone && (
        <div className="flex items-center gap-3 bg-success-50 dark:bg-success-500/10 border border-success-300 dark:border-success-500/30 rounded-xl px-4 py-3">
          <CheckCircle2
            size={16}
            className="text-success-600 dark:text-success-400 shrink-0"
          />
          <p className="text-sm text-success-700 dark:text-success-300 font-medium">
            Agent is live and responding correctly.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          onClick={onRetry}
          className="text-sm text-foreground-500 hover:text-foreground transition-colors"
        >
          Retry
        </button>
        <button
          onClick={onFinish}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Open agent page <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
