/**
 * Shared OTel metric instruments for the control plane.
 * All instruments are no-ops when OTel is disabled.
 */

import { metrics } from "@opentelemetry/api";

const meter = metrics.getMeter("vaultysclaw-control-plane");

// Agents currently connected via WebSocket
export const agentsConnected = meter.createUpDownCounter("vc.agents.connected", {
  description: "Number of agents currently connected",
});

// LLM token consumption reported via heartbeats
export const llmTokens = meter.createCounter("vc.llm.tokens", {
  description: "LLM tokens consumed",
  unit: "tokens",
});

// LLM call end-to-end latency
export const llmLatency = meter.createHistogram("vc.llm.latency_ms", {
  description: "LLM call latency in milliseconds",
  unit: "ms",
});

// Intent execution outcomes
export const intentsTotal = meter.createCounter("vc.intents.total", {
  description: "Total intent executions",
});

// Workflow run outcomes
export const workflowRunsTotal = meter.createCounter("vc.workflow_runs.total", {
  description: "Total workflow run completions",
});
