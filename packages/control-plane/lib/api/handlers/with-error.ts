// lib/api/with-error.ts
import { NextResponse } from "next/server";

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
      console.error(error);

      if (error instanceof ApiError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.status }
        );
      }

      return NextResponse.json(
        { error: "Internal Server Error" },
        { status: 500 }
      );
    }
  };
}
