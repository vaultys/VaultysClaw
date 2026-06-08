/**
 * OpenTelemetry SDK initialisation for the agent controller.
 * Must be imported before any other modules.
 *
 * Set OTEL_ENABLED=true to activate.
 * Standard env vars:
 *   OTEL_EXPORTER_OTLP_ENDPOINT  e.g. http://localhost:4318
 *   OTEL_SERVICE_NAME             defaults to vaultysclaw-agent
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

let sdk: NodeSDK | null = null;

export function initOTel(): void {
  if (process.env.OTEL_ENABLED !== "true") return;
  if (sdk) return;

  // OTEL_SERVICE_NAME env var is read automatically by the SDK if set
  sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
      }),
    ],
  });

  sdk.start();

  process.on("SIGTERM", () => sdk?.shutdown());
  process.on("beforeExit", () => sdk?.shutdown());
}
