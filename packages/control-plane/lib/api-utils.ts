/**
 * Utilities for consistent API response handling
 */

import { NextResponse } from "next/server";
import { toPaginatedResponse, toErrorResponse } from "./api-types";
import type { ListResponse, ErrorResponse } from "./api-types";

/**
 * Return a standard paginated response
 */
export function apiPaginatedResponse<T>(
  items: T[],
  total: number,
  page: number = 1,
  pageSize: number = 50,
  status: number = 200
) {
  return NextResponse.json(toPaginatedResponse(items, total, page, pageSize), {
    status,
  });
}

/**
 * Return a standard error response
 */
export function apiErrorResponse(
  error: string,
  code: string,
  statusCode: number = 500,
  details?: Record<string, any>
) {
  return NextResponse.json(toErrorResponse(error, code, statusCode, details), {
    status: statusCode,
  });
}

/**
 * Return a standard successful response
 */
export function apiSuccessResponse<T>(data: T, status: number = 200) {
  return NextResponse.json(data, { status });
}

/**
 * Parse pagination query parameters
 */
export function parsePaginationParams(
  searchParams: Record<string, string | string[] | undefined>,
  defaultPageSize: number = 50,
  maxPageSize: number = 100
): { page: number; pageSize: number } {
  let page = 1;
  let pageSize = defaultPageSize;

  if (typeof searchParams.page === "string") {
    const p = parseInt(searchParams.page, 10);
    if (p > 0) page = p;
  }

  if (typeof searchParams.pageSize === "string") {
    const ps = parseInt(searchParams.pageSize, 10);
    if (ps > 0 && ps <= maxPageSize) pageSize = ps;
  }

  return { page, pageSize };
}

/**
 * Common validation errors
 */
export const ValidationErrors = {
  MISSING_REQUIRED_FIELD: (field: string) => ({
    error: `Missing required field: ${field}`,
    code: "VALIDATION_ERROR",
    statusCode: 400,
  }),
  INVALID_REQUEST: (reason: string) => ({
    error: `Invalid request: ${reason}`,
    code: "INVALID_REQUEST",
    statusCode: 400,
  }),
  NOT_FOUND: (resource: string) => ({
    error: `${resource} not found`,
    code: "NOT_FOUND",
    statusCode: 404,
  }),
  UNAUTHORIZED: () => ({
    error: "Unauthorized",
    code: "UNAUTHORIZED",
    statusCode: 401,
  }),
  FORBIDDEN: () => ({
    error: "Forbidden",
    code: "FORBIDDEN",
    statusCode: 403,
  }),
  CONFLICT: (reason: string) => ({
    error: `Conflict: ${reason}`,
    code: "CONFLICT",
    statusCode: 409,
  }),
  INTERNAL_ERROR: () => ({
    error: "Internal server error",
    code: "INTERNAL_ERROR",
    statusCode: 500,
  }),
};

/**
 * Wrap an async route handler to catch errors and return standardized responses
 */
export function withErrorHandler<P extends any[], R>(
  handler: (...args: P) => Promise<R>
): (...args: P) => Promise<any> {
  return async (...args: P) => {
    try {
      return await handler(...args);
    } catch (error) {
      console.error("API Error:", error);
      return apiErrorResponse(
        error instanceof Error ? error.message : "Internal server error",
        "INTERNAL_ERROR",
        500
      );
    }
  };
}
