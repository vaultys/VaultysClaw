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

export function unavailable(error?: unknown): NextResponse {
  return NextResponse.json(
    { error: errorMessage("Service unavailable", error) },
    { status: 503 }
  );
}

export function conflict(error?: unknown): NextResponse {
  return NextResponse.json(
    { error: errorMessage("Conflict", error) },
    { status: 409 }
  );
}

export function contentTooLarge(error?: unknown): NextResponse {
  return NextResponse.json(
    { error: errorMessage("Content too large", error) },
    { status: 413 }
  );
}

export function unprocessableEntity(error?: unknown): NextResponse {
  return NextResponse.json(
    { error: errorMessage("Unprocessable entity", error) },
    { status: 422 }
  );
}
