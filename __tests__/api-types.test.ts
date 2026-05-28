import { describe, it, expect } from "vitest";
import {
  toPaginatedResponse,
  toErrorResponse,
  toSuccessResponse,
} from "../packages/control-plane/lib/api-types";

describe("API Types", () => {
  describe("toPaginatedResponse", () => {
    it("should create a paginated response with correct structure", () => {
      const items = [{ id: "1", name: "Item 1" }];
      const result = toPaginatedResponse(items, 100, 1, 50);

      expect(result).toEqual({
        items,
        pagination: {
          total: 100,
          page: 1,
          pageSize: 50,
          totalPages: 2,
        },
      });
    });

    it("should calculate correct total pages", () => {
      const result = toPaginatedResponse([], 75, 1, 25);
      expect(result.pagination.totalPages).toBe(3);
    });

    it("should handle exact page boundaries", () => {
      const result = toPaginatedResponse([], 100, 2, 50);
      expect(result.pagination.totalPages).toBe(2);
    });

    it("should use default page and pageSize", () => {
      const result = toPaginatedResponse([]);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.pageSize).toBe(50);
    });
  });

  describe("toErrorResponse", () => {
    it("should create an error response with correct structure", () => {
      const result = toErrorResponse(
        "Resource not found",
        "NOT_FOUND",
        404,
        { resourceId: "123" }
      );

      expect(result).toMatchObject({
        error: "Resource not found",
        code: "NOT_FOUND",
        statusCode: 404,
        details: { resourceId: "123" },
      });
      expect(result.timestamp).toBeDefined();
    });

    it("should use default status code 500", () => {
      const result = toErrorResponse("Error", "ERROR");
      expect(result.statusCode).toBe(500);
    });

    it("should handle missing details", () => {
      const result = toErrorResponse("Error", "ERROR");
      expect(result.details).toBeUndefined();
    });
  });

  describe("toSuccessResponse", () => {
    it("should create a success response with correct structure", () => {
      const data = { id: "1", name: "Success" };
      const result = toSuccessResponse(data);

      expect(result).toMatchObject({
        data,
      });
      expect(result.timestamp).toBeDefined();
    });

    it("should include message when provided", () => {
      const result = toSuccessResponse({ id: "1" }, "Created successfully");
      expect(result.message).toBe("Created successfully");
    });
  });
});
