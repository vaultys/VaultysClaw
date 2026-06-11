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
  return new NextResponse(null, { status: 204 });
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

export enum HttpCodes {
  FORBIDDEN = 403,
  UNAUTHORIZED = 401,
  NOT_FOUND = 404,
  MALFORMED = 400,
  NO_CONTENT = 204,
  UNAVAILABLE = 503,
  CONFLICT = 409,
  CONTENT_TOO_LARGE = 413,
  UNPROCESSABLE_ENTITY = 422,
}

export type HttpCode = keyof typeof HttpCodes;
export class APIException extends Error {
  code: HttpCode;
  message: string;
  constructor(code: HttpCode, message?: string) {
    super(message);
    this.code = code;
    this.message = message || HttpCodes[code].toString();
  }
}

/** Canonical error payload returned by every route. */
export interface ApiErrorBody {
  error: string;
  code: string;
}

/**
 * Map a thrown value to an HTTP status + body. Shared by both error handlers:
 * the legacy `withError` wrapper and the ts-rest `createNextRoute` adapter.
 *
 * An {@link APIException} becomes its declared status (via {@link HttpCodes})
 * with a machine-readable `code`; anything else is masked as a 500 so internal
 * details never leak to clients.
 */
export function resolveApiError(error: unknown): {
  status: number;
  body: ApiErrorBody;
  /** True for unexpected errors the caller should log. */
  unexpected: boolean;
} {
  if (error instanceof APIException) {
    return {
      status: HttpCodes[error.code],
      body: { error: error.message, code: error.code },
      unexpected: false,
    };
  }
  return {
    status: 500,
    body: { error: "Internal Server Error", code: "INTERNAL_ERROR" },
    unexpected: true,
  };
}
