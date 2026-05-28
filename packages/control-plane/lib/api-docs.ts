/**
 * API Documentation and Query Parameter Schemas
 * Documents all available endpoints and their query parameters
 */

export interface ParamSchema {
  type: string;
  description: string;
  default?: any;
  required?: boolean;
  examples?: any[];
  enum?: any[];
  min?: number;
  max?: number;
}

export interface QuerySchema {
  [key: string]: ParamSchema;
}

// ────────────────────────────────────────────────────────────
// Pagination Parameters (Common to all list endpoints)
// ────────────────────────────────────────────────────────────

export const PAGINATION_PARAMS: QuerySchema = {
  page: {
    type: "number",
    description: "Page number (1-indexed)",
    default: 1,
    min: 1,
    examples: [1, 2, 10],
  },
  pageSize: {
    type: "number",
    description: "Items per page",
    default: 50,
    min: 1,
    max: 100,
    examples: [10, 50, 100],
  },
  sortBy: {
    type: "string",
    description: "Field to sort by",
    examples: ["createdAt", "name", "updatedAt"],
  },
  sortDir: {
    type: "string",
    description: "Sort direction",
    enum: ["asc", "desc"],
    default: "desc",
  },
};

// ────────────────────────────────────────────────────────────
// Agents Endpoints
// ────────────────────────────────────────────────────────────

export const AGENTS_LIST_SCHEMA: QuerySchema = {
  ...PAGINATION_PARAMS,
  q: {
    type: "string",
    description: "Search by name or capabilities",
    examples: ["file_access", "my-agent"],
  },
  online: {
    type: "boolean",
    description: "Filter by online status",
  },
  realm: {
    type: "string",
    description: "Filter by realm ID",
  },
  capabilities: {
    type: "string",
    description: "Comma-separated capability list filter",
    examples: ["file_access,internet_access"],
  },
  status: {
    type: "string",
    description: "Filter by connection status",
    enum: ["connected", "connecting", "disconnected", "initializing", "pending_approval"],
  },
};

// ────────────────────────────────────────────────────────────
// Users Endpoints
// ────────────────────────────────────────────────────────────

export const USERS_LIST_SCHEMA: QuerySchema = {
  ...PAGINATION_PARAMS,
  q: {
    type: "string",
    description: "Search by email or name",
    examples: ["john@example.com", "John Doe"],
  },
  role: {
    type: "string",
    description: "Filter by role",
    enum: ["admin", "member", "viewer"],
  },
  realm: {
    type: "string",
    description: "Filter by realm ID",
  },
};

// ────────────────────────────────────────────────────────────
// Realms Endpoints
// ────────────────────────────────────────────────────────────

export const REALMS_LIST_SCHEMA: QuerySchema = {
  ...PAGINATION_PARAMS,
  q: {
    type: "string",
    description: "Search by name or slug",
    examples: ["production", "prod-realm"],
  },
};

// ────────────────────────────────────────────────────────────
// Workflows Endpoints
// ────────────────────────────────────────────────────────────

export const WORKFLOWS_LIST_SCHEMA: QuerySchema = {
  ...PAGINATION_PARAMS,
  q: {
    type: "string",
    description: "Search by name",
  },
  realm: {
    type: "string",
    description: "Filter by realm ID",
  },
  enabled: {
    type: "boolean",
    description: "Filter by enabled status",
  },
};

// ────────────────────────────────────────────────────────────
// Channels Endpoints
// ────────────────────────────────────────────────────────────

export const CHANNELS_LIST_SCHEMA: QuerySchema = {
  ...PAGINATION_PARAMS,
  q: {
    type: "string",
    description: "Search by channel name",
  },
  realm: {
    type: "string",
    description: "Filter by realm ID",
  },
  public: {
    type: "boolean",
    description: "Filter by public/private status",
  },
};

// ────────────────────────────────────────────────────────────
// Knowledge Endpoints
// ────────────────────────────────────────────────────────────

export const KNOWLEDGE_LIST_SCHEMA: QuerySchema = {
  ...PAGINATION_PARAMS,
  q: {
    type: "string",
    description: "Search by name or source",
  },
  realm: {
    type: "string",
    description: "Filter by realm ID",
  },
  source: {
    type: "string",
    description: "Filter by source type (file, url, etc)",
    enum: ["file", "url", "database", "api"],
  },
};

/**
 * Get the documentation URL for an endpoint
 * Example: `/api/agents` → `/docs/api/agents`
 */
export function getDocUrl(endpoint: string): string {
  return `/docs/api${endpoint}`;
}

/**
 * Validate query parameters against a schema
 */
export function validateQueryParams(
  params: Record<string, any>,
  schema: QuerySchema
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const [key, value] of Object.entries(params)) {
    const paramSchema = schema[key];
    if (!paramSchema && !key.startsWith("_")) {
      errors.push(`Unknown parameter: ${key}`);
      continue;
    }

    if (paramSchema) {
      // Type validation
      const actualType = typeof value;
      if (paramSchema.type && actualType !== paramSchema.type.toLowerCase()) {
        errors.push(`Parameter ${key} must be ${paramSchema.type}, got ${actualType}`);
      }

      // Enum validation
      if (paramSchema.enum && !paramSchema.enum.includes(value)) {
        errors.push(
          `Parameter ${key} must be one of: ${paramSchema.enum.join(", ")}`
        );
      }

      // Numeric range validation
      if (paramSchema.type === "number") {
        const num = Number(value);
        if (paramSchema.min !== undefined && num < paramSchema.min) {
          errors.push(`Parameter ${key} must be >= ${paramSchema.min}`);
        }
        if (paramSchema.max !== undefined && num > paramSchema.max) {
          errors.push(`Parameter ${key} must be <= ${paramSchema.max}`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
