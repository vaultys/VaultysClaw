import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/db";
import { getAuthContext } from "@/lib/auth-utils";

export async function GET(request: NextRequest) {
  try {
    await getAuthContext(request);

    const settings = await prisma.setting.findMany({
      where: {
        key: {
          in: ["otel_enabled", "otel_base_url", "otel_service_name"],
        },
      },
    });

    const dbEnabled = settings.find((s) => s.key === "otel_enabled")?.value;
    const dbBaseUrl = settings.find((s) => s.key === "otel_base_url")?.value;
    const dbServiceName = settings.find((s) => s.key === "otel_service_name")?.value;

    const config = {
      // DB value wins; fall back to env vars
      enabled:
        dbEnabled !== undefined
          ? dbEnabled === "true"
          : process.env.OTEL_ENABLED === "true",
      baseUrl:
        dbBaseUrl ||
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
        "",
      serviceName:
        dbServiceName ||
        process.env.OTEL_SERVICE_NAME ||
        "vaultysclaw-control-plane",
      connected: false,
      // Let the UI know these values came from env so it can show a hint
      fromEnv: {
        enabled: dbEnabled === undefined && process.env.OTEL_ENABLED !== undefined,
        baseUrl: !dbBaseUrl && !!process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
        serviceName: !dbServiceName && !!process.env.OTEL_SERVICE_NAME,
      },
    };

    return NextResponse.json(config);
  } catch (error) {
    console.error("Failed to get OTel config:", error);
    return NextResponse.json(
      { error: "Failed to retrieve configuration" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    await getAuthContext(request);

    const body = await request.json() as {
      enabled: boolean;
      baseUrl?: string;
      serviceName?: string;
    };

    // Save settings
    await prisma.setting.upsert({
      where: { key: "otel_enabled" },
      update: { value: body.enabled ? "true" : "false" },
      create: { key: "otel_enabled", value: body.enabled ? "true" : "false" },
    });

    if (body.baseUrl) {
      await prisma.setting.upsert({
        where: { key: "otel_base_url" },
        update: { value: body.baseUrl },
        create: { key: "otel_base_url", value: body.baseUrl },
      });
    }

    if (body.serviceName) {
      await prisma.setting.upsert({
        where: { key: "otel_service_name" },
        update: { value: body.serviceName },
        create: { key: "otel_service_name", value: body.serviceName },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to save OTel config:", error);
    return NextResponse.json(
      { error: "Failed to save configuration" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await getAuthContext(request);

    const body = (await request.json()) as { baseUrl?: string };
    const testUrl = body.baseUrl;

    if (!testUrl) {
      return NextResponse.json(
        { error: "baseUrl is required" },
        { status: 400 }
      );
    }

    // Try to connect to OTLP endpoint
    const startTime = Date.now();
    try {
      const response = await fetch(`${testUrl}/v1/traces`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceSpans: [],
        }),
        signal: AbortSignal.timeout(5000),
      });
      const latency = Date.now() - startTime;

      return NextResponse.json({
        connected: response.ok,
        latency,
        statusCode: response.status,
      });
    } catch (testError) {
      return NextResponse.json({
        connected: false,
        error: testError instanceof Error ? testError.message : "Connection failed",
      });
    }
  } catch (error) {
    console.error("Failed to test OTel:", error);
    return NextResponse.json(
      { error: "Failed to test connection" },
      { status: 500 }
    );
  }
}
