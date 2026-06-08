/**
 * OpenTelemetry SDK initialisation for the control plane.
 *
 * Must be imported/called before any other modules to ensure auto-instrumentation
 * patches are applied before the instrumented libraries are loaded.
 *
 * Set OTEL_ENABLED=true to activate. When disabled, all OTel API calls are no-ops
 * so the rest of the codebase can import @opentelemetry/api unconditionally.
 *
 * Standard env vars honoured by the SDK (no custom parsing needed):
 *   OTEL_EXPORTER_OTLP_ENDPOINT  e.g. http://localhost:4318
 *   OTEL_SERVICE_NAME             defaults to vaultysclaw-control-plane
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";

let sdk: NodeSDK | null = null;

export function initOTel(): void {
  if (process.env.OTEL_ENABLED !== "true") return;
  if (sdk) return;

  // OTEL_SERVICE_NAME env var is read automatically by the SDK if set
  sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter(),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: 15_000,
    }),
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
