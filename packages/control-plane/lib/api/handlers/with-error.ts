// lib/api/with-error.ts
import { NextResponse } from "next/server";
import { APIException, resolveApiError } from "@/lib/api/utils/api-utils";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export function withError<T extends (...args: any[]) => Promise<Response>>(
  handler: T
) {
  return async (...args: Parameters<T>) => {
    try {
      return await handler(...args);
    } catch (error) {
      // Preferred path: APIException (e.g. thrown by getAuthContext) maps to a
      // typed status + machine-readable code via the shared resolver.
      if (error instanceof APIException) {
        const { status, body } = resolveApiError(error);
        return NextResponse.json(body, { status });
      }

      console.error(error);

      // Legacy ApiError kept for routes not yet migrated to APIException.
      if (error instanceof ApiError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.status }
        );
      }

      return NextResponse.json(
        { error: "Internal Server Error", code: "INTERNAL_ERROR" },
        { status: 500 }
      );
    }
  };
}
