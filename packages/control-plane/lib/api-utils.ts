import { NextResponse } from "next/server";

function errorMessage(defaultMessage: string, error?: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return defaultMessage;
}

export function forbidden(error?: unknown): NextResponse {
  return NextResponse.json(
    { error: errorMessage("Forbidden", error) },
    { status: 403 }
  );
}

export function unauthorized(error?: unknown): NextResponse {
  return NextResponse.json(
    { error: errorMessage("Not authenticated", error) },
    { status: 401 }
  );
}

export function notFound(error?: unknown): NextResponse {
  return NextResponse.json(
    { error: errorMessage("Not found", error) },
    { status: 404 }
  );
}

export function malformed(error?: unknown): NextResponse {
  return NextResponse.json(
    { error: errorMessage("Malformed request", error) },
    { status: 400 }
  );
}

export function successNoContent(): NextResponse {
  return NextResponse.json(null, { status: 204 });
}
