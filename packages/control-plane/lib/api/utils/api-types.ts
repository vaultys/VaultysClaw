/**
 * Standardized API response types for VaultysClaw
 * Provides consistency across all REST endpoints
 */

/**
 * Standard pagination metadata included in list responses
 */
export interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Standard list response wrapper for paginated results
 */
export interface ListResponse<T> {
  items: T[];
  pagination: PaginationMeta;
}

/**
 * Standard error response format
 */
export interface ErrorResponse {
  error: string;
  code: string;
  statusCode: number;
  details?: Record<string, any>;
  timestamp?: string;
}

/**
 * Success response wrapper (optional for consistency)
 */
export interface SuccessResponse<T> {
  data: T;
  message?: string;
  timestamp?: string;
}

// ────────────────────────────────────────────────────────────
// Resource Types
// ────────────────────────────────────────────────────────────

export interface AgentSummary {
  id: string;
  did: string;
  name: string;
  status:
    | "connected"
    | "connecting"
    | "disconnected"
    | "initializing"
    | "pending_approval";
  capabilities: string[];
  online?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserSummary {
  id: string;
  did: string;
  email: string;
  name?: string;
  role?: "admin" | "member" | "viewer";
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  description?: string;
  agentCount: number;
  userCount: number;
  workflowCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowSummary {
  id: string;
  name: string;
  workspaceId: string;
  enabled: boolean;
  triggers: string[];
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
}

export interface ChannelSummary {
  id: string;
  name: string;
  workspaceId: string;
  isPublic: boolean;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSessionSummary {
  id: string;
  agentDid: string;
  title?: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

// ────────────────────────────────────────────────────────────
// API Key Types
// ────────────────────────────────────────────────────────────

export interface ApiKey {
  id: string;
  name: string;
  /** Displayable prefix, e.g. "vc_key_XXXXXXXX" — never the full key */
  keyPrefix: string;
  allowedRoutes: string[];
  /** null = global access, string = scoped to this workspace */
  workspaceId: string | null;
  isWorkspaceAdmin: boolean;
  createdBy: string;
  createdAt: number;
  lastUsedAt: number | null;
  expiresAt: number | null;
  isActive: boolean;
}

export interface ApiKeyCreateRequest {
  name: string;
  allowedRoutes: string[];
  workspaceId?: string | null;
  isWorkspaceAdmin?: boolean;
  expiresAt?: number | null;
}

export interface ApiKeyUpdateRequest {
  name?: string;
  allowedRoutes?: string[];
  workspaceId?: string | null;
  isWorkspaceAdmin?: boolean;
  expiresAt?: number | null;
  isActive?: boolean;
}

/** Returned only on creation — includes the full raw key shown once */
export interface ApiKeyCreatedResponse {
  apiKey: ApiKey;
  /** The full raw key — shown to the user exactly once, never stored */
  key: string;
}

// ────────────────────────────────────────────────────────────
// Helper function to create paginated responses
// ────────────────────────────────────────────────────────────

export function toPaginatedResponse<T>(
  items: T[],
  total: number,
  page: number = 1,
  pageSize: number = 50
): ListResponse<T> {
  return {
    items,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

export function toErrorResponse(
  error: string,
  code: string,
  statusCode: number = 500,
  details?: Record<string, any>
): ErrorResponse {
  return {
    error,
    code,
    statusCode,
    details,
    timestamp: new Date().toISOString(),
  };
}

export function toSuccessResponse<T>(
  data: T,
  message?: string
): SuccessResponse<T> {
  return {
    data,
    message,
    timestamp: new Date().toISOString(),
  };
}
