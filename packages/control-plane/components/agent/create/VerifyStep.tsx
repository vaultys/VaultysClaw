"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Loader2,
  CheckCircle2,
  ArrowRight,
  AlertTriangle,
  MessageSquare,
} from "lucide-react";

interface VerifyStepProps {
  agentDid: string | null;
  onFinish: () => void;
}

const VERIFY_PROMPT = "List all the tools and skills you currently have access to.";

export function VerifyStep({ agentDid, onFinish }: VerifyStepProps) {
  const [verifyText, setVerifyText] = useState("");
  const [verifyDone, setVerifyDone] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const verifyRef = useRef<HTMLPreElement>(null);

  // Run the verification prompt on mount and whenever Retry bumps `attempt`
  useEffect(() => {
    if (!agentDid) return;

    let cancelled = false;
    setVerifyText("");
    setVerifyDone(false);
    setVerifyError(null);

    (async () => {
      try {
        const res = await fetch(
          `/api/agents/${encodeURIComponent(agentDid)}/chat-sessions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: [{ role: "user", content: VERIFY_PROMPT }],
            }),
          }
        );
        if (!res.ok || !res.body) {
          setVerifyError(`Agent responded with HTTP ${res.status}`);
          setVerifyDone(true);
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (payload === "[DONE]") {
              setVerifyDone(true);
              return;
            }
            try {
              const parsed = JSON.parse(payload) as {
                text?: string;
                error?: string;
              };
              if (parsed.error) {
                setVerifyError(parsed.error);
                setVerifyDone(true);
                return;
              }
              if (parsed.text) setVerifyText((t) => t + parsed.text);
            } catch {
              /* skip malformed */
            }
          }
        }
        if (!cancelled) setVerifyDone(true);
      } catch (e) {
        if (!cancelled) {
          setVerifyError(
            e instanceof Error ? e.message : "Failed to reach agent"
          );
          setVerifyDone(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [agentDid, attempt]);

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
        <p className="text-sm text-foreground italic">&ldquo;{VERIFY_PROMPT}&rdquo;</p>
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
          <div className="px-4 py-4 text-sm text-danger-600 flex items-center gap-2">
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
        <div className="flex items-center gap-3 bg-success-50 border border-success-300 rounded-xl px-4 py-3">
          <CheckCircle2
            size={16}
            className="text-success-600 shrink-0"
          />
          <p className="text-sm text-success-700 font-medium">
            Agent is live and responding correctly.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          onClick={() => setAttempt((a) => a + 1)}
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
